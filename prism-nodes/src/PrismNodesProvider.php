<?php

declare(strict_types=1);

namespace PrismNodes;

use Illuminate\Console\Scheduling\Schedule;
use PrismNodes\Console\TickCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismNodesProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-nodes:tick')->everyMinute()->withoutOverlapping(10));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('history', 'history', true, ['required', 'boolean'])->label('Keep usage history')->help('Every five minutes, what each node\'s servers use is added up for the graphs. Kept for 7 days.')->tab('General')->field('toggle'),
            Setting::make('check_updates', 'check_updates', true, ['required', 'boolean'])->label('Look for Wings updates')->help('Asks GitHub for the newest Wings release every six hours. Nothing about your panel is sent.')->tab('General')->field('toggle'),
        ]));
    }
}
