<?php

declare(strict_types=1);

namespace PrismTerraria;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Egg;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismTerrariaProvider extends ExtensionProvider
{
    /** The server tabs the admin can hide, by screen. */
    public const array TABS = [
        'players' => 'Players',
        'versions' => 'Versions',
        'properties' => 'Properties',
        'world' => 'World',
        'mods' => 'Mods',
        'plugins' => 'Plugins',
    ];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Terraria tools from Prism Terraria.', [
            'players-view' => 'See players, accounts and server-side characters.',
            'players-manage' => 'Kick, ban, whitelist and change players.',
            'properties' => 'Edit the server and TShock settings.',
            'versions' => 'Change the Terraria, TShock or tModLoader version.',
            'world' => 'See world details and the world map.',
            'mods' => 'Install, update and remove tModLoader mods.',
            'plugins' => 'Install and remove TShock plugins.',
        ]);

        $this->registerFields(Egg::class, EggFields::class);

        $tabs = [];
        foreach (self::TABS as $tab => $label) {
            $tabs[] = Setting::make('tab_'.$tab, 'tab_'.$tab, true, ['required', 'boolean'])->label($label)->help('Shows the '.$label.' tab on Terraria servers.')->tab('Server tabs')->field('toggle')->frontend()->frontendType('boolean');
        }

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ...$tabs,

            // Detection
            Setting::make('egg_tags', 'egg_tags', \PrismTerraria\Support\Settings::DEFAULT_TAGS, ['required', 'string', 'max:300', 'regex:/^[A-Za-z0-9_\- ,]+$/'])->label('Egg tags to detect')->help("Servers whose egg has one of these tags, separated by commas, are Prism Terraria servers. The default is terraria and tria. Add your own tag to include eggs that use it.")->tab('Detection')->field('text')->frontend(),

            // Content
            Setting::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])->label('Confirm before installing')->help('Ask before a mod or plugin is installed.')->tab('Content')->field('toggle'),

            // World
            Setting::make('max_world_mb', 'max_world_mb', 256, ['required', 'integer', 'min:4', 'max:512'])->label('Largest world for the map')->help('World files bigger than this are not sent to the browser to draw the map.')->tab('World')->field('number'),

            // API keys
            Setting::make('steam_api_key', 'steam_api_key', '', ['nullable', 'string', 'max:64', 'regex:/^([A-Fa-f0-9]{32})?$/'])->label('Steam Web API key')->help('Needed to browse the tModLoader Workshop. Get one at steamcommunity.com/dev/apikey with any Steam account.')->tab('API keys')->field('password'),
        ]));
    }
}
