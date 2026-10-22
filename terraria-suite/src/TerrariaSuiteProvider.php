<?php

declare(strict_types=1);

namespace TerrariaSuite;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Egg;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class TerrariaSuiteProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Terraria tools from Terraria Suite.', [
            'players-view' => 'See players, accounts and server-side characters.',
            'players-manage' => 'Kick, ban, whitelist and change players.',
            'properties' => 'Edit the server and TShock settings.',
            'versions' => 'Change the Terraria, TShock or tModLoader version.',
            'world' => 'See world details and the world map.',
            'mods' => 'Install, update and remove tModLoader mods.',
            'plugins' => 'Install and remove TShock plugins.',
        ]);

        $this->registerFields(Egg::class, EggFields::class);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])
                ->label('Confirm before installing')
                ->help('Ask before a mod or plugin is installed.')
                ->field('toggle'),
            ExtensionSettingDefinition::make('steam_api_key', 'steam_api_key', '', ['nullable', 'string', 'max:64', 'regex:/^([A-Fa-f0-9]{32})?$/'])
                ->label('Steam Web API key')
                ->help('Needed to browse the tModLoader Workshop. Get one at steamcommunity.com/dev/apikey with any Steam account.')
                ->field('password'),
            ExtensionSettingDefinition::make('max_world_mb', 'max_world_mb', 64, ['required', 'integer', 'min:4', 'max:512'])
                ->label('Largest world for the map (MB)')
                ->help('World files bigger than this are not sent to the browser for the map.')
                ->field('number'),
        ]));
    }
}
