//! Control That Speed! for Pumpkin 0.2.0.
//!
//! `/speed <kind> <multiplier> [targets]` scales one of a player's speeds against its vanilla
//! value; `/speed reset [targets]` puts them all back. Kinds: walk, fly, sneak, mine,
//! underwater. Without targets the command applies to the player running it.

use pumpkin_plugin_api::{
    Attribute, Context, Plugin, PluginMetadata, Player,
    command::{ArgumentType, Command, CommandError, CommandNode, CommandSender, ConsumedArgs},
    command_wit::{Arg, Number},
    commands::CommandHandler,
    common::NamedColor,
    permission::{Permission, PermissionDefault, PermissionLevel},
    text::TextComponent,
};

const PERMISSION: &str = "ControlThatSpeed:command.speed";

/// Highest multiplier allowed; Minecraft clients misbehave far above this.
const MAX_MULTIPLIER: f32 = 10.0;

#[derive(Clone, Copy)]
enum Kind {
    Walk,
    Fly,
    Sneak,
    Mine,
    Underwater,
}

impl Kind {
    const ALL: [Kind; 5] = [Kind::Walk, Kind::Fly, Kind::Sneak, Kind::Mine, Kind::Underwater];

    fn name(self) -> &'static str {
        match self {
            Kind::Walk => "walk",
            Kind::Fly => "fly",
            Kind::Sneak => "sneak",
            Kind::Mine => "mine",
            Kind::Underwater => "underwater",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Kind::Walk => "walking",
            Kind::Fly => "flying",
            Kind::Sneak => "sneaking",
            Kind::Mine => "mining",
            Kind::Underwater => "underwater mining",
        }
    }

    /// The vanilla value a multiplier of 1 stands for.
    fn base(self) -> f64 {
        match self {
            Kind::Walk => 0.1,
            Kind::Fly => 0.05,
            Kind::Sneak => 0.3,
            Kind::Mine => 1.0,
            Kind::Underwater => 0.2,
        }
    }

    fn apply(self, player: &Player, multiplier: f32) {
        let value = self.base() * f64::from(multiplier);
        match self {
            // Flight speed is an ability, sent to the client with the other abilities.
            Kind::Fly => {
                let mut abilities = player.get_abilities();
                abilities.fly_speed = value as f32;
                player.set_abilities(abilities);
            }
            Kind::Walk => set_attribute(player, Attribute::MovementSpeed, value),
            Kind::Sneak => set_attribute(player, Attribute::SneakingSpeed, value),
            Kind::Mine => set_attribute(player, Attribute::BlockBreakSpeed, value),
            Kind::Underwater => set_attribute(player, Attribute::SubmergedMiningSpeed, value),
        }
    }
}

fn set_attribute(player: &Player, attribute: Attribute, value: f64) {
    if let Some(living) = player.as_entity().as_living() {
        living.set_attribute_base(attribute, value);
    }
}

fn message(text: &str, color: NamedColor) -> TextComponent {
    TextComponent::text(text).color_named(color)
}

fn failure(text: &str) -> CommandError {
    CommandError::CommandFailed(message(text, NamedColor::Red))
}

/// The players a command acts on: the named targets, or the sender.
fn targets(sender: &CommandSender, args: &ConsumedArgs) -> Result<Vec<Player>, CommandError> {
    if let Arg::Players(players) = args.get_value("targets") {
        return Ok(players);
    }

    sender
        .as_player()
        .map(|player| vec![player])
        .ok_or_else(|| failure("Name a player when running this from the console."))
}

fn multiplier(args: &ConsumedArgs) -> Result<f32, CommandError> {
    match args.get_value("multiplier") {
        Arg::Num(Ok(Number::Float32(value))) => Ok(value),
        Arg::Num(Ok(Number::Float64(value))) => Ok(value as f32),
        _ => Err(failure(&format!("Use a multiplier from 0 to {MAX_MULTIPLIER}."))),
    }
}

fn tell(sender: &CommandSender, text: String) {
    if let Some(player) = sender.as_player() {
        player.send_system_message(message(&text, NamedColor::Green), false);
    }
}

struct SetSpeed(Kind);

impl CommandHandler for SetSpeed {
    fn handle(
        &self,
        sender: CommandSender,
        _server: pumpkin_plugin_api::Server,
        args: ConsumedArgs,
    ) -> Result<i32, CommandError> {
        let multiplier = multiplier(&args)?;
        let players = targets(&sender, &args)?;

        for player in &players {
            self.0.apply(player, multiplier);
        }

        tell(&sender, format!("Set {} speed to {multiplier}x for {}.", self.0.label(), names(&players)));

        Ok(players.len() as i32)
    }
}

struct ResetSpeed;

impl CommandHandler for ResetSpeed {
    fn handle(
        &self,
        sender: CommandSender,
        _server: pumpkin_plugin_api::Server,
        args: ConsumedArgs,
    ) -> Result<i32, CommandError> {
        let players = targets(&sender, &args)?;

        for player in &players {
            for kind in Kind::ALL {
                kind.apply(player, 1.0);
            }
        }

        tell(&sender, format!("Reset every speed for {}.", names(&players)));

        Ok(players.len() as i32)
    }
}

struct Usage;

impl CommandHandler for Usage {
    fn handle(
        &self,
        sender: CommandSender,
        _server: pumpkin_plugin_api::Server,
        _args: ConsumedArgs,
    ) -> Result<i32, CommandError> {
        tell(
            &sender,
            "Usage: /speed <walk|fly|sneak|mine|underwater> <multiplier> [players], or /speed reset [players]. 1 is normal speed.".into(),
        );

        Ok(0)
    }
}

fn names(players: &[Player]) -> String {
    match players {
        [one] => one.get_name(),
        many => format!("{} players", many.len()),
    }
}

fn players_argument() -> CommandNode {
    CommandNode::argument("targets", &ArgumentType::Players)
}

struct ControlThatSpeed;

impl Plugin for ControlThatSpeed {
    fn new() -> Self {
        ControlThatSpeed
    }

    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            name: "ControlThatSpeed".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            authors: vec!["MC Suite".into()],
            description: "Speed multipliers for walking, flying, sneaking and mining.".into(),
            dependencies: vec![],
            permissions: vec![],
        }
    }

    fn on_load(&self, context: Context) -> pumpkin_plugin_api::Result<()> {
        let mut command = Command::new(&["speed".to_string()], "Set a player's speed multiplier").execute(Usage);

        for kind in Kind::ALL {
            command = command.then(
                CommandNode::literal(kind.name()).then(
                    CommandNode::argument("multiplier", &ArgumentType::Float((Some(0.0), Some(MAX_MULTIPLIER))))
                        .execute(SetSpeed(kind))
                        .then(players_argument().execute(SetSpeed(kind))),
                ),
            );
        }

        command = command.then(CommandNode::literal("reset").execute(ResetSpeed).then(players_argument().execute(ResetSpeed)));

        context.register_permission(&Permission {
            node: PERMISSION.into(),
            description: "Use the /speed command".into(),
            default: PermissionDefault::Op(PermissionLevel::Two),
            children: vec![],
        })?;
        context.register_command(command, PERMISSION);

        Ok(())
    }

    fn on_unload(&self, _context: Context) -> pumpkin_plugin_api::Result<()> {
        Ok(())
    }
}

pumpkin_plugin_api::register_plugin!(ControlThatSpeed);
