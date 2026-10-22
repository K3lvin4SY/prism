<?php

declare(strict_types=1);

namespace McSuite;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Egg;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class McSuiteProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Minecraft tools from MC Suite.', [
            'players-view' => 'See players, their inventories and stats.',
            'players-manage' => 'Op, whitelist, ban, kick and change players.',
            'properties' => 'Edit server.properties and the server icon.',
            'versions' => 'Change the server software and version.',
            'plugins' => 'Install, update and remove plugins.',
            'mods' => 'Install, update and remove mods.',
            'modpacks' => 'Install modpacks. This replaces mods and configs.',
        ]);

        $this->registerFields(Egg::class, EggFields::class);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])
                ->label('Confirm before installing')
                ->help('Ask before a plugin or mod is installed. Users can turn this off for themselves; this is the default for users who have not chosen. Modpacks always ask.')
                ->field('toggle'),
            ExtensionSettingDefinition::make('allow_snapshots', 'allow_snapshots', true, ['required', 'boolean'])
                ->label('Show snapshots')
                ->help('List snapshot and experimental builds on the Versions tab.')
                ->field('toggle')
                ->frontend()
                ->frontendType('boolean'),
            ExtensionSettingDefinition::make('modpack_max_mb', 'modpack_max_mb', 500, ['required', 'integer', 'min:10', 'max:4000'])
                ->label('Largest modpack (MB)')
                ->help('Modpack archives bigger than this are refused.')
                ->field('number'),
            ExtensionSettingDefinition::make('ping_timeout', 'ping_timeout', 2, ['required', 'numeric', 'min:0.5', 'max:10'])
                ->label('Status ping timeout (seconds)')
                ->help('How long to wait for a server to answer a server-list ping.')
                ->field('number'),
            ExtensionSettingDefinition::make('pumpkin_market_key', 'pumpkin_market_key', '', ['nullable', 'string', 'max:200', 'regex:/^(pmk_[A-Za-z0-9]+)?$/'])
                ->label('Pumpkin Market API key')
                ->help('A pmk_ key from your Pumpkin Market profile. Plugins from the Market are listed for Pumpkin servers; the key is sent with every Market request.')
                ->field('password'),
        ]));
    }
}
