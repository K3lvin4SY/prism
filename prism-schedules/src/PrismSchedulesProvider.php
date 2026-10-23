<?php

declare(strict_types=1);

namespace PrismSchedules;

use Illuminate\Console\Scheduling\Schedule;
use PrismSchedules\Console\TickCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismSchedulesProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-schedules:tick')->everyMinute()->withoutOverlapping(5));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // General
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use Prism Schedules')->help('Off puts the panel\'s own Schedules page back and stops Prism schedules from running.')->tab('General')->field('toggle')->frontend(),
            Setting::make('default_view', 'default_view', 'plus', ['required', 'string', 'in:plus,classic'])->label('Shown first')->help('People can switch between the two on the page.')->tab('General')->field('select', [['value' => 'plus', 'label' => 'Prism schedules'], ['value' => 'classic', 'label' => 'The panel\'s schedules']])->frontend(),

            // Features
            Setting::make('feature_discord', 'feature_discord', true, ['required', 'boolean'])->label('Discord messages')->help('A step that posts to a Discord webhook. The panel makes the request.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_state_triggers', 'feature_state_triggers', true, ['required', 'boolean'])->label('Start, stop and crash triggers')->help('The panel checks each server with such a schedule once a minute.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_empty_trigger', 'feature_empty_trigger', true, ['required', 'boolean'])->label('"Server is empty" trigger')->help('Minecraft only. The panel sends "list" to the server once a minute to count players.')->tab('Features')->field('toggle')->frontend(),

            // Limits
            Setting::make('max_schedules', 'max_schedules', 25, ['required', 'integer', 'min:1', 'max:200'])->label('Schedules per server')->tab('Limits')->field('number')->frontend(),
            Setting::make('max_steps', 'max_steps', 50, ['required', 'integer', 'min:1', 'max:200'])->label('Steps per schedule')->tab('Limits')->field('number')->frontend(),
            Setting::make('history_days', 'history_days', 7, ['required', 'integer', 'min:1', 'max:90'])->label('Keep run history for')->tab('Limits')->field('number')->frontend(),
        ]));
    }
}
