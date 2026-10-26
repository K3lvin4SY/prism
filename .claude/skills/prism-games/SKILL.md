---
name: prism-games
description: Prism MC (Minecraft Java/Bedrock) and Prism Terraria (vanilla, TShock, tModLoader) - how a server is detected, the server tabs and their code, install plans and job progress, players and NBT, world maps, versions, properties and the MOTD editor, content sources, crossplay, proxies and the test servers. Load before working on either game extension.
---

# Prism MC and Prism Terraria

Both add server screens (tabs) that only show on servers of their game. Client screens live in `src/client/screens`, components in `src/client/components`, pure logic with tests in `src/client/lib`. PHP: controllers in `src/Http/Controllers` (all extend the extension's `Controller`, which has `authorizeFeature($request, $server, $tab, $permission)`), helpers in `src/Support`, jobs in `src/Jobs`.

## Detection: which servers get the tabs

- **Egg tags**: a server whose egg has one of the `egg_tags` setting's tags (Prism MC: `minecraft`; Prism Terraria: `terraria, tria`) is a candidate (`Support/Settings.php`).
- **`Support/Detector.php`** then works out the edition (java, bedrock), the software (paper, purpur, fabric, forge, neoforge, quilt, velocity, waterfall, bungeecord, pumpkin, …; Terraria: vanilla, tshock, tmodloader) and the game version from the egg, startup variables and files. The answer is cached a few minutes; `Detector::forget($server)` clears it (install plans do).
- **Egg override**: Prism MC adds a "Prism MC server type" field to the admin egg form (`src/EggFields.php`, client `EggTypeField`) to force or switch off detection for an egg.
- The client asks `GET …/extensions/prism-mc/info` (`InfoController`, hook `useMcInfo`) and shows a tab when the feature applies and its `tab_*` setting is on (`showFor` in `src/client/index.tsx`).

## Prism MC tabs (manifest paths) and their code

| Tab | Screen | Main backend |
| --- | --- | --- |
| Players `players`, `players/$player` | `PlayersScreen`, `PlayerScreen` (summary card, inventory + HUD, ender chest, advancements, control panel) | `PlayersController`, `Support/PlayerData.php` (player .dat NBT, ops/whitelist/bans, Bedrock via LevelDB `LevelDb.php`, `BedrockNbt.php`), `Skins.php` |
| Versions `versions` | `VersionsScreen` | `VersionsController`, `McJars.php`, `McJarsInstaller.php`, `PumpkinReleases.php`, `WorldVersion.php` |
| Properties `properties` | `PropertiesScreen` (server.properties grouped, MOTD editor, crossplay, proxy) | `PropertiesController`, `ServerProperties.php`, `PropertiesFile.php`, `PropertySchema.php` + `resources/properties.json`, `PumpkinConfig.php`/`TomlLines.php` |
| World `world` | `WorldScreen` (map from region files, player markers) | `MapController`, client `lib/anvil.ts`, `lib/blockColors.ts` |
| Plugins `plugins`, Mods `mods` | content browser (search, versions, dependencies, installed list) | `ContentController`, `Support/Providers/*` (Modrinth, Pumpkin Market) |
| Modpacks `modpacks` | `ModpacksScreen` | `ModpacksController`, `Mrpack.php` |

Other pieces:
- **Player actions** go through `POST …/players/action` (`PlayersController::action`): gamemode, xp, heal/feed/starve/kill, clear, message, kick, **teleport** (to a player, or `x,y,z` in a dimension via `execute in …`), op/whitelist/ban (written to the list files when the server is stopped). Offline inventory edits rewrite the player file (`lib/nbtio.ts`, `lib/inventoryEdit.ts`) with a hash check.
- **MOTD editor** (`components/MotdEditor.tsx`): `&` codes per character (`lib/ampersand.ts`), hex colors and gradients on Paper-like servers (`lib/motd.ts`, `GradientSlider`, `ColorPicker`), autosaves to server.properties; centring keeps leading spaces (sent as `leading` because Laravel trims strings).
- **Crossplay** (`CrossplayController`, `components/CrossplayPanel.tsx`): installs Geyser + Floodgate (Modrinth or download.geysermc.org, checksum-verified) on the server's own port, or flips Pumpkin's native Bedrock; **Check for updates** hashes the installed jars against the newest builds and **Update** swaps them in an install plan with rollback.
- **Proxy networks** (`ProxyController`, `ProxyConfig.php`, `ProxyForwarding.php`): link backend servers to a Velocity/BungeeCord proxy and set forwarding.
- **PatchBukkit** (`PatchBukkitController`, `PatchBukkit.php`): Bukkit plugins on Pumpkin.
- **Feature switches**: `feature_crossplay`, `feature_proxy`, `feature_skins`, `feature_patchbukkit` (routes use the `RequireFeature` middleware).

## Prism Terraria tabs

Players (`terraria-players`, `PlayersController`: online players and activity from the console and logs via `ServerConsole.php`, accounts and characters from the TShock database `TShockDatabase.php`, bans), Versions (`Releases.php`), Properties (`SettingsController`, `ServerConfigTxt.php`, `TerrariaSettings.php`, `SettingsSchema.php`), World (`WorldController`, `Worlds.php`, client `lib/wld.ts`, map colors from `scripts/gen-terraria-data.mjs`), Mods (tModLoader, Steam Workshop: `Workshop.php`, `WorkshopMods.php`, needs `steam_api_key`), Plugins (TShock, `PluginCatalog.php`). Console commands go through `ServerConsole.php`.

## Install plans

Long changes run as `Support/InstallPlan.php` + `Jobs/RunInstallPlan.php` (both extensions):

```php
$plan = InstallPlan::for($server, 'Updating Bedrock crossplay')->stopServer();
$plan->add('rename', [...])->onFailure('rename', [...])
     ->add('pulls', ['files' => [['url' => …, 'dir' => 'plugins', 'file' => …, 'size' => …]]])
     ->add('verify', ['path' => …, 'algorithm' => 'sha1'|'sha256', 'hash' => …])
     ->add('power', ['action' => 'start']);
$job = $plan->dispatch($request->user(), '<permission>');   // returns the job id for JobProgress
```

- One plan per server (cache lock); state in cache for an hour; slices on the `standard` queue. Downloads are Wings pulls, finished when the listed size matches, so never pull onto an existing file of the same name: move the old one aside first.
- Rollback steps run in order, best effort. Record installed content with `record`/`forget` (`content.<folder>.<file>` in the server's settings) so the installed lists know where it came from.
- The client shows progress with `components/JobProgress.tsx`. If a plan stays "queued", the Panel's queue worker is down (see `prism-deploy-and-test`).

## Testing

Use the `mc-suite-test-*` servers (`prism-deploy-and-test` lists them). Fabric (`a3662484`) has Geyser/Floodgate and mods; Paper (`a2c27e65`) is the hex-MOTD server whose MOTD must not be changed; Terraria ones: tshock `9fcfbc9b`, vanilla `dba74775`, tModLoader `9f732e51`. Commands sent to offline players are harmless ("No entity was found") and good for checking command syntax in `logs/latest.log`.
