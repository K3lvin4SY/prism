<?php

declare(strict_types=1);

namespace PrismCoreKeeper;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismCoreKeeperProvider extends ExtensionProvider
{
    public const array TABS = ['players' => 'Players', 'world' => 'Map', 'mods' => 'Mods', 'versions' => 'Versions', 'properties' => 'Properties'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Core Keeper tools from Prism Core Keeper.', [
            'players-view' => 'See who is online, who has played, the player pages and how to join.',
            'players-manage' => 'Change the admin list.',
            'properties' => 'Edit the world and server settings, and turn the Prism server mod on or off.',
            'versions' => 'Change the Core Keeper build.',
            'world' => 'See the shared Cartography Table map and who last synced it.',
            'mods' => 'Install, update and remove mods from mod.io and the Steam Workshop.',
        ]);

        $tabs = [];
        foreach (self::TABS as $tab => $label) {
            $tabs[] = Setting::make('tab_'.$tab, 'tab_'.$tab, true, ['required', 'boolean'])->label($label)->help('Shows the '.$label.' tab on Core Keeper servers.')->tab('Server tabs')->field('toggle')->frontend()->frontendType('boolean');
        }

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ...$tabs,

            // Detection
            Setting::make('egg_tags', 'egg_tags', Support\Settings::DEFAULT_TAGS, ['required', 'string', 'max:300', 'regex:/^[A-Za-z0-9_\- ,]+$/'])->label('Egg tags to detect')->help('Servers whose egg has one of these tags, separated by commas, are Core Keeper servers. Eggs that install the Core Keeper dedicated server (Steam app 1963720) are found without a tag.')->tab('Detection')->field('text')->frontend(),

            // Mods
            Setting::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])->label('Confirm before installing')->help('Ask before a mod is installed.')->tab('Mods')->field('toggle'),
            Setting::make('modio_api_key', 'modio_api_key', '', ['nullable', 'string', 'max:64', 'regex:/^([A-Za-z0-9]{32})?$/'])->label('mod.io API key')->help('Needed to browse and install mods from mod.io. Get a read-only key at mod.io/me/access.')->tab('Mods')->field('password'),
            Setting::make('steam_api_key', 'steam_api_key', '', ['nullable', 'string', 'max:64', 'regex:/^([A-Fa-f0-9]{32})?$/'])->label('Steam Web API key')->help('Needed to browse the Steam Workshop. Get one at steamcommunity.com/dev/apikey with any Steam account.')->tab('Mods')->field('password'),
            Setting::make('steam_username', 'steam_username', '', ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9_.@-]*$/'])->label('Steam account for Workshop downloads')->help('Optional. Steam may refuse Workshop downloads without signing in. Use an account that owns Core Keeper and has no Steam Guard, such as a spare one: its login is written to the game server just before it starts, and deleted once used. Empty downloads anonymously.')->tab('Mods')->field('password'),
            Setting::make('steam_password', 'steam_password', '', ['nullable', 'string', 'max:128'])->label('Steam account password')->tab('Mods')->field('password'),
        ]));
    }
}
