<?php

declare(strict_types=1);

namespace PrismMc;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Egg;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismMcProvider extends ExtensionProvider
{
    /** The server tabs the admin can hide, by screen. */
    public const array TABS = [
        'players' => 'Players',
        'versions' => 'Versions',
        'properties' => 'Properties',
        'world' => 'World',
        'plugins' => 'Plugins',
        'mods' => 'Mods',
        'modpacks' => 'Modpacks',
    ];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Minecraft tools from Prism MC.', [
            'players-view' => 'See players, their inventories and stats.',
            'players-manage' => 'Op, whitelist, ban, kick and change players.',
            'properties' => 'Edit server.properties and the server icon.',
            'versions' => 'Change the server software and version.',
            'world' => 'See the world map and where players are.',
            'plugins' => 'Install, update and remove plugins.',
            'mods' => 'Install, update and remove mods.',
            'modpacks' => 'Install modpacks. This replaces mods and configs.',
        ]);

        $this->registerFields(Egg::class, EggFields::class);

        $tabs = [];
        foreach (self::TABS as $tab => $label) {
            $tabs[] = Setting::make('tab_'.$tab, 'tab_'.$tab, true, ['required', 'boolean'])->label($label)->help('Shows the '.$label.' tab on Minecraft servers.')->tab('Server tabs')->field('toggle')->frontend()->frontendType('boolean');
        }

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ...$tabs,

            // Detection
            Setting::make('egg_tags', 'egg_tags', \PrismMc\Support\Settings::DEFAULT_TAGS, ['required', 'string', 'max:300', 'regex:/^[A-Za-z0-9_\- ,]+$/'])->label('Egg tags to detect')->help("Servers whose egg has one of these tags, separated by commas, are Prism MC servers. The default is minecraft. Add your own tag to include eggs that use it.")->tab('Detection')->field('text')->frontend(),

            // Features
            Setting::make('feature_crossplay', 'feature_crossplay', true, ['required', 'boolean'])->label('Crossplay')->help('Geyser and Floodgate on the Properties tab, so Bedrock players can join Java servers.')->tab('Features')->field('toggle')->frontend()->frontendType('boolean'),
            Setting::make('feature_proxy', 'feature_proxy', true, ['required', 'boolean'])->label('Proxy networks')->help('Link servers behind Velocity, BungeeCord or Waterfall from the Properties tab.')->tab('Features')->field('toggle')->frontend()->frontendType('boolean'),
            Setting::make('feature_skins', 'feature_skins', true, ['required', 'boolean'])->label('3D skins')->help('Player skins as a model you can turn, on player pages.')->tab('Features')->field('toggle')->frontend()->frontendType('boolean'),
            Setting::make('feature_patchbukkit', 'feature_patchbukkit', true, ['required', 'boolean'])->label('PatchBukkit')->help('Run Bukkit plugins on Pumpkin servers, from the Plugins tab.')->tab('Features')->field('toggle')->frontend()->frontendType('boolean'),

            // Content
            Setting::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])->label('Confirm before installing')->help('Ask before a plugin or mod is installed. People can turn this off for themselves; this is the default for those who have not chosen. Modpacks always ask.')->tab('Content')->field('toggle'),
            Setting::make('allow_snapshots', 'allow_snapshots', false, ['required', 'boolean'])->label('Show snapshots')->help('List snapshot and experimental builds on the Versions tab.')->tab('Content')->field('toggle')->frontend()->frontendType('boolean'),
            Setting::make('source_pumpkin_market', 'source_pumpkin_market', true, ['required', 'boolean'])->label('Pumpkin Market')->help('List plugins from the Pumpkin Market for Pumpkin servers, beside Modrinth.')->tab('Content')->field('toggle'),
            Setting::make('modpack_max_mb', 'modpack_max_mb', 2000, ['required', 'integer', 'min:10', 'max:4000'])->label('Largest modpack')->help('Modpack archives bigger than this are refused.')->tab('Content')->field('number'),

            // Status
            Setting::make('ping_timeout', 'ping_timeout', 2, ['required', 'numeric', 'min:0.5', 'max:10'])->label('Status ping timeout')->help('How long to wait for a server to answer a server-list ping, in seconds.')->tab('Status')->field('number'),

            // API keys
            Setting::make('pumpkin_market_key', 'pumpkin_market_key', '', ['nullable', 'string', 'max:200', 'regex:/^(pmk_[A-Za-z0-9]+)?$/'])->label('Pumpkin Market API key')->help('A pmk_ key from your Pumpkin Market profile, sent with every Market request.')->tab('API keys')->field('password'),
        ]));
    }
}
