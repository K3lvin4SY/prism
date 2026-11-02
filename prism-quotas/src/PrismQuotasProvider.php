<?php

declare(strict_types=1);

namespace PrismQuotas;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismQuotasProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', false, ['required', 'boolean'])->label('People may create servers')->help('On the account\'s "Create a server" page, within their quota. Set up the limits and the eggs on offer on the admin Quotas page first.')->tab('General')->field('toggle')->frontend(),
            Setting::make('who', 'who', 'everyone', ['required', 'string', 'in:everyone,listed'])->label('Who may')->help('Everyone uses the default limits unless they have their own. Only listed: just the people given their own limits.')->tab('General')->field('select', [['value' => 'everyone', 'label' => 'Everyone'], ['value' => 'listed', 'label' => 'Only people with their own limits']])->frontend(),
            Setting::make('allow_delete', 'allow_delete', true, ['required', 'boolean'])->label('People may delete servers they created')->help('Only servers made on the Create a server page, after typing the server\'s name. Frees their quota again.')->tab('General')->field('toggle')->frontend(),
        ]));
    }
}
