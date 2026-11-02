<?php

declare(strict_types=1);

namespace PrismStatus;

use Illuminate\Console\Scheduling\Schedule;
use PrismStatus\Console\TickCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismStatusProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerRootRoutes($this->extensionPath('routes', 'root.php'));
        $this->loadExtensionViews();

        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-status:tick')->everyMinute()->withoutOverlapping(5));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', false, ['required', 'boolean'])->label('Show the status page')->help('At /status on this panel. Off, the address shows nothing and checks stop; history and incidents are kept.')->tab('Page')->field('toggle')->frontend(),
            Setting::make('title', 'title', '', ['nullable', 'string', 'max:80'])->label('Title')->help('Empty shows the panel\'s name followed by "status".')->tab('Page')->field('text'),
            Setting::make('intro', 'intro', '', ['nullable', 'string', 'max:500'])->label('Text under the title')->help('Such as where else to find news, or how to reach you.')->tab('Page')->textarea(500),
            Setting::make('history_days', 'history_days', 90, ['required', 'integer', 'in:30,60,90'])->label('Uptime history')->tab('Page')->field('select', [['value' => 30, 'label' => '30 days'], ['value' => 60, 'label' => '60 days'], ['value' => 90, 'label' => '90 days']]),
            Setting::make('layout_logo', 'layout_logo', true, ['required', 'boolean'])->label('Show Prism Layout\'s logo')->tab('Page')->field('toggle'),
            Setting::make('require_sign_in', 'require_sign_in', false, ['required', 'boolean'])->label('Only for signed-in people')->help('Visitors are sent to the sign-in page first.')->tab('Page')->field('toggle')->frontend(),
        ]));
    }
}
