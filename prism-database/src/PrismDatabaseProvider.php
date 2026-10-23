<?php

declare(strict_types=1);

namespace PrismDatabase;

use Illuminate\Console\Scheduling\Schedule;
use PrismDatabase\Console\TickCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismDatabaseProvider extends ExtensionProvider
{
    public const array INTERVALS = ['hourly' => 'Hourly', '6h' => 'Every 6 hours', '12h' => 'Every 12 hours', 'daily' => 'Daily', 'weekly' => 'Weekly'];

    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-database:tick')->everyFiveMinutes()->withoutOverlapping());

        $choices = static fn (array $values): array => array_map(static fn (string $value, string $label) => ['value' => $value, 'label' => $label], array_keys($values), $values);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // General
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use Prism Database Manager')->help('Off puts the panel\'s own Databases page back.')->tab('General')->field('toggle')->frontend(),
            Setting::make('usage_history', 'usage_history', true, ['required', 'boolean'])->label('Usage history')->help('Records each database\'s size and rows every hour for the 30 day chart.')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_rows_page', 'max_rows_page', 100, ['required', 'integer', 'min:10', 'max:1000'])->label('Rows per page in the table browser')->tab('General')->field('number')->frontend(),

            // SQL console
            Setting::make('sql_console', 'sql_console', true, ['required', 'boolean'])->label('SQL console')->tab('SQL console')->field('toggle')->frontend(),
            Setting::make('sql_read_only', 'sql_read_only', false, ['required', 'boolean'])->label('Read only')->help('Only SELECT, SHOW, DESCRIBE, EXPLAIN and WITH queries run, inside a read-only transaction.')->tab('SQL console')->field('toggle')->frontend(),
            Setting::make('sql_max_rows', 'sql_max_rows', 1000, ['required', 'integer', 'min:10', 'max:10000'])->label('Rows shown per result')->tab('SQL console')->field('number')->frontend(),
            Setting::make('sql_timeout', 'sql_timeout', 15, ['required', 'integer', 'min:1', 'max:300'])->label('Query time limit (seconds)')->tab('SQL console')->field('number')->frontend(),

            // Import and export
            Setting::make('import_max_mb', 'import_max_mb', 100, ['required', 'integer', 'min:1', 'max:2048'])->label('Largest import (MB)')->tab('Import & export')->field('number')->frontend(),
            Setting::make('export_keep_hours', 'export_keep_hours', 24, ['required', 'integer', 'min:1', 'max:168'])->label('Keep export downloads for (hours)')->tab('Import & export')->field('number')->frontend(),

            // Backups
            Setting::make('backups', 'backups', true, ['required', 'boolean'])->label('Backups')->tab('Backups')->field('toggle')->frontend(),
            Setting::make('backup_fastest', 'backup_fastest', 'hourly', ['required', 'string', 'in:hourly,6h,12h,daily,weekly'])->label('Most frequent automatic backups')->help('People cannot schedule backups more often than this.')->tab('Backups')->field('select', $choices(self::INTERVALS))->frontend(),
            Setting::make('backup_max_keep', 'backup_max_keep', 20, ['required', 'integer', 'min:1', 'max:200'])->label('Most backups kept per database')->help('Locked backups count towards this.')->tab('Backups')->field('number')->frontend(),
            Setting::make('backup_max_mb', 'backup_max_mb', 2048, ['required', 'integer', 'min:10', 'max:102400'])->label('Backup storage per database (MB)')->tab('Backups')->field('number')->frontend(),

            // Sharing
            Setting::make('sharing', 'sharing', true, ['required', 'boolean'])->label('Sharing between servers')->help('Lets people share a database with their other servers, for example one LuckPerms database for a network.')->tab('Sharing')->field('toggle')->frontend(),
        ]));
    }
}
