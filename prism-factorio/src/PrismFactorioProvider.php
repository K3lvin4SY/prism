<?php

declare(strict_types=1);

namespace PrismFactorio;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismFactorioProvider extends ExtensionProvider
{
    public const array TABS = ['players' => 'Players', 'mods' => 'Mods', 'versions' => 'Versions', 'properties' => 'Properties'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Factorio tools from Prism Factorio.', [
            'players-view' => 'See who is online, who has played, the admins, bans and whitelist.',
            'players-manage' => 'Kick, ban, promote and whitelist players, and message them.',
            'properties' => 'Edit the server settings.',
            'versions' => 'Change the Factorio version.',
            'mods' => 'Install, update, turn off and remove mods from the Factorio mod portal.',
        ]);

        $tabs = [];
        foreach (self::TABS as $tab => $label) {
            $tabs[] = Setting::make('tab_'.$tab, 'tab_'.$tab, true, ['required', 'boolean'])->label($label)->help('Shows the '.$label.' tab on Factorio servers.')->tab('Server tabs')->field('toggle')->frontend()->frontendType('boolean');
        }

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ...$tabs,

            // Detection
            Setting::make('egg_tags', 'egg_tags', Support\Settings::DEFAULT_TAGS, ['required', 'string', 'max:300', 'regex:/^[A-Za-z0-9_\- ,]+$/'])->label('Egg tags to detect')->help('Servers whose egg has one of these tags, separated by commas, are Factorio servers. Eggs that start bin/x64/factorio are found without a tag.')->tab('Detection')->field('text')->frontend(),

            // Mods
            Setting::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])->label('Confirm before installing')->help('Ask before a mod is installed.')->tab('Mods')->field('toggle'),
            Setting::make('factorio_username', 'factorio_username', '', ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_.@+-]*$/'])->label('factorio.com username')->help('The mod portal only gives downloads to a factorio.com account. Used for servers whose own settings have no username and token.')->tab('Mods')->field('text'),
            Setting::make('factorio_token', 'factorio_token', '', ['nullable', 'string', 'max:64', 'regex:/^([A-Za-z0-9]{16,64})?$/'])->label('factorio.com token')->help('The token from factorio.com/profile, not the password.')->tab('Mods')->field('password'),
        ]));
    }
}
