<?php

declare(strict_types=1);

namespace PrismSatisfactory;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismSatisfactoryProvider extends ExtensionProvider
{
    public const array TABS = ['players' => 'Players', 'mods' => 'Mods', 'versions' => 'Versions', 'properties' => 'Properties'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Satisfactory tools from Prism Satisfactory.', [
            'players-view' => 'See who is online and who has played.',
            'properties' => 'Edit the server settings, connect the Panel to the server and start a new game.',
            'versions' => 'Switch between the public and experimental builds.',
            'mods' => 'Install, update, turn off and remove mods from ficsit.app.',
        ]);

        $tabs = [];
        foreach (self::TABS as $tab => $label) {
            $tabs[] = Setting::make('tab_'.$tab, 'tab_'.$tab, true, ['required', 'boolean'])->label($label)->help('Shows the '.$label.' tab on Satisfactory servers.')->tab('Server tabs')->field('toggle')->frontend()->frontendType('boolean');
        }

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ...$tabs,

            // Detection
            Setting::make('egg_tags', 'egg_tags', Support\Settings::DEFAULT_TAGS, ['required', 'string', 'max:300', 'regex:/^[A-Za-z0-9_\- ,]+$/'])->label('Egg tags to detect')->help('Servers whose egg has one of these tags, separated by commas, are Satisfactory servers. Eggs that install the Satisfactory dedicated server (Steam app 1690800) are found without a tag.')->tab('Detection')->field('text')->frontend(),

            // Mods
            Setting::make('confirm_installs', 'confirm_installs', true, ['required', 'boolean'])->label('Confirm before installing')->help('Ask before a mod is installed.')->tab('Mods')->field('toggle'),
        ]));
    }
}
