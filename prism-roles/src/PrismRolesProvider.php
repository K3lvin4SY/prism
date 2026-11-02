<?php

declare(strict_types=1);

namespace PrismRoles;

use PrismRoles\Support\LinkCreatedSubusers;
use PrismRoles\Support\LinkUpdatedSubusers;
use Pterodactyl\Contracts\Subusers\CreatesSubusers;
use Pterodactyl\Contracts\Subusers\UpdatesSubusers;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismRolesProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        // Saving a subuser links it to the role applied on the form, or marks a link customised.
        $this->wrapAction(CreatesSubusers::class, fn (CreatesSubusers $inner): CreatesSubusers => new LinkCreatedSubusers($inner));
        $this->wrapAction(UpdatesSubusers::class, fn (UpdatesSubusers $inner): UpdatesSubusers => new LinkUpdatedSubusers($inner));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use subuser roles')->help('Off, the role picker and the roles pages are hidden. Subusers keep their permissions.')->tab('General')->field('toggle')->frontend(),
            Setting::make('personal', 'personal', true, ['required', 'boolean'])->label('Users may save their own roles')->help('Off, only the panel-wide roles made by admins can be used.')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_personal', 'max_personal', 20, ['required', 'integer', 'min:1', 'max:100'])->label('Most roles a user may save')->tab('General')->field('number')->frontend(),
        ]));
    }
}
