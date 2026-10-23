<?php

declare(strict_types=1);

namespace PrismBackups;

use Illuminate\Console\Scheduling\Schedule;
use PrismBackups\Actions\ProfileBackups;
use PrismBackups\Console\CleanCommand;
use Pterodactyl\Contracts\Backups\InitiatesBackups;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismBackupsProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerCommands([CleanCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-backups:clean')->hourly()->withoutOverlapping());

        // A "# prism-backups: profile=<name>" line in any backup's ignore list, a schedule task's
        // included, becomes that profile's patterns.
        $this->wrapAction(InitiatesBackups::class, static fn (InitiatesBackups $inner): InitiatesBackups => new ProfileBackups($inner));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // General
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use Prism Backups')->help('Off puts the panel\'s own Backups page back for everyone.')->tab('General')->field('toggle')->frontend(),
            Setting::make('owners_only', 'owners_only', false, ['required', 'boolean'])->label('Only server owners get the extras')->help('Subusers see the plain list: no profiles, browsing, single file restores or .pteroignore editor.')->tab('General')->field('toggle')->frontend(),

            // Features
            Setting::make('feature_profiles', 'feature_profiles', true, ['required', 'boolean'])->label('Backup profiles')->help('Choose what a backup includes: everything except some files, or only what is picked.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_browse', 'feature_browse', true, ['required', 'boolean'])->label('Browse inside backups')->help('The panel downloads the archive and lists what is in it.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_file_restore', 'feature_file_restore', true, ['required', 'boolean'])->label('Restore single files')->help('Put picked files back where they were, or into a folder.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_pteroignore', 'feature_pteroignore', true, ['required', 'boolean'])->label('.pteroignore editor')->help('Edit the server\'s .pteroignore and test which paths it skips.')->tab('Features')->field('toggle')->frontend(),

            // Limits
            Setting::make('max_profiles', 'max_profiles', 10, ['required', 'integer', 'min:1', 'max:50'])->label('Profiles per server')->tab('Limits')->field('number')->frontend(),
            Setting::make('browse_max_mb', 'browse_max_mb', 4096, ['required', 'integer', 'min:10', 'max:102400'])->label('Largest backup to browse')->help('Bigger backups can still be downloaded and restored whole.')->tab('Limits')->field('number')->frontend(),
            Setting::make('restore_max_mb', 'restore_max_mb', 1024, ['required', 'integer', 'min:1', 'max:20480'])->label('Most data per single file restore')->tab('Limits')->field('number')->frontend(),
            Setting::make('cache_hours', 'cache_hours', 6, ['required', 'integer', 'min:1', 'max:72'])->label('Keep downloaded backups on the panel for')->help('A browsed backup stays on the panel this long, so opening it again is quick.')->tab('Limits')->field('number')->frontend(),
        ]));
    }
}
