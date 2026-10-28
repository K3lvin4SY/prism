<?php

declare(strict_types=1);

namespace PrismShare;

use Illuminate\Console\Scheduling\Schedule;
use PrismShare\Models\Link;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismShareProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerRootRoutes($this->extensionPath('routes', 'root.php'));
        $this->loadExtensionViews();

        $this->registerPermissions('Guest share links from Prism Share.', [
            'manage' => 'Make, change and revoke share links. A link can only allow what the person saving it may do.',
        ]);

        // Links that ended a month ago; until then they show in the list and the activity log names them.
        $this->registerSchedule(fn (Schedule $schedule) => $schedule->call(fn () => Link::query()->where('expires_at', '<', now()->subDays(30))->delete())->daily()->name('prism-share:forget-links'));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use share links')->help('Off, every link stops working and the Share links page is hidden.')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_hours', 'max_hours', 168, ['required', 'integer', 'min:1', 'max:720'])->label('Longest a link may last (hours)')->help('168 is a week; 720 is 30 days.')->tab('General')->field('number')->frontend(),
            Setting::make('allow_commands', 'allow_commands', false, ['required', 'boolean'])->label('Links may send console commands')->help('Anyone with such a link can run any command, such as making themselves an operator.')->tab('What links may allow')->field('toggle')->frontend(),
            Setting::make('allow_power', 'allow_power', true, ['required', 'boolean'])->label('Links may start, stop and restart')->tab('What links may allow')->field('toggle')->frontend(),
            Setting::make('allow_files', 'allow_files', true, ['required', 'boolean'])->label('Links may download files')->help('Only from the folders and files the link names.')->tab('What links may allow')->field('toggle')->frontend(),
            Setting::make('allow_backups', 'allow_backups', true, ['required', 'boolean'])->label('Links may download backups')->help('Only the backups the link names.')->tab('What links may allow')->field('toggle')->frontend(),
        ]));
    }
}
