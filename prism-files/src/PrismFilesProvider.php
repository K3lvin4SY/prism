<?php

declare(strict_types=1);

namespace PrismFiles;

use Illuminate\Console\Scheduling\Schedule;
use PrismFiles\Console\CleanTrashCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismFilesProvider extends ExtensionProvider
{
    /** Editor keybinds people can change; values are Monaco-style chords. */
    public const string DEFAULT_KEYBINDS = '{"save":"Ctrl+S","saveAll":"Ctrl+Alt+S","quickOpen":"Ctrl+P","commandPalette":"Ctrl+Shift+P","closeTab":"Alt+W","reopenTab":"Ctrl+Shift+T","toggleExplorer":"Ctrl+B","goToLine":"Ctrl+G"}';

    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerCommands([CleanTrashCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-files:clean-trash')->dailyAt('04:20'));

        $choices = static fn (array $values): array => array_map(static fn (string $value, string $label) => ['value' => $value, 'label' => $label], array_keys($values), $values);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // Features
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Replace the file manager')->help('Off puts the panel\'s own file manager back.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('workbench', 'workbench', true, ['required', 'boolean'])->label('Editor workbench')->help('The VS Code style editor with an explorer tree, tabs, quick open and the command palette.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('monaco_edit_page', 'monaco_edit_page', true, ['required', 'boolean'])->label('Monaco in the panel\'s edit page')->help('Opening a file from elsewhere in the panel uses the same editor.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('trash', 'trash', true, ['required', 'boolean'])->label('Trash bin')->help('Deleting moves files into a hidden trash folder that can be restored from.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('open_on', 'open_on', 'files', ['required', 'string', 'in:files,editor'])->label('Open on')->help('What the Files tab shows first.')->tab('Features')->field('select', $choices(['files' => 'File list', 'editor' => 'Editor (tree and tabs)']))->frontend(),
            Setting::make('default_view', 'default_view', 'list', ['required', 'string', 'in:list,grid'])->label('Default file view')->tab('Features')->field('select', $choices(['list' => 'List', 'grid' => 'Grid']))->frontend(),

            // Editor
            Setting::make('editor_theme', 'editor_theme', 'auto', ['required', 'string', 'in:auto,dark,light,contrast'])->label('Editor theme')->help('Auto follows the panel\'s light or dark scheme.')->tab('Editor')->field('select', $choices(['auto' => 'Follow the panel', 'dark' => 'Dark', 'light' => 'Light', 'contrast' => 'High contrast']))->frontend(),
            Setting::make('editor_font_size', 'editor_font_size', 13, ['required', 'integer', 'min:9', 'max:24'])->label('Text size')->tab('Editor')->field('number')->frontend(),
            Setting::make('editor_tab_size', 'editor_tab_size', 4, ['required', 'integer', 'min:1', 'max:8'])->label('Tab size')->tab('Editor')->field('number')->frontend(),
            Setting::make('editor_word_wrap', 'editor_word_wrap', false, ['required', 'boolean'])->label('Wrap long lines')->tab('Editor')->field('toggle')->frontend(),
            Setting::make('editor_minimap', 'editor_minimap', true, ['required', 'boolean'])->label('Minimap')->tab('Editor')->field('toggle')->frontend(),
            Setting::make('editor_sticky_scroll', 'editor_sticky_scroll', true, ['required', 'boolean'])->label('Sticky scroll')->tab('Editor')->field('toggle')->frontend(),
            Setting::make('editor_bracket_colors', 'editor_bracket_colors', true, ['required', 'boolean'])->label('Bracket colours')->tab('Editor')->field('toggle')->frontend(),
            Setting::make('editor_autosave', 'editor_autosave', 'off', ['required', 'string', 'in:off,delay,focus'])->label('Auto save')->tab('Editor')->field('select', $choices(['off' => 'Off', 'delay' => 'After a short pause', 'focus' => 'When the editor loses focus']))->frontend(),
            Setting::make('allow_editor_settings', 'allow_editor_settings', true, ['required', 'boolean'])->label('People may change their own editor')->help('Their own text size, theme, wrap and keybinds.')->tab('Editor')->field('toggle')->frontend(),

            // Trash
            Setting::make('trash_days', 'trash_days', 7, ['required', 'integer', 'min:1', 'max:90'])->label('Keep deleted files for (days)')->help('Items older than this are deleted for good once a day.')->tab('Trash')->field('number')->frontend(),

            // Limits
            Setting::make('max_edit_mb', 'max_edit_mb', 4, ['required', 'integer', 'min:1', 'max:50'])->label('Largest file to open in the editor (MB)')->tab('Limits')->field('number')->frontend(),
            Setting::make('max_upload_mb', 'max_upload_mb', 1024, ['required', 'integer', 'min:1', 'max:10240'])->label('Largest upload (MB)')->tab('Limits')->field('number')->frontend(),
            Setting::make('parallel_uploads', 'parallel_uploads', 3, ['required', 'integer', 'min:1', 'max:8'])->label('Uploads at the same time')->tab('Limits')->field('number')->frontend(),

            // Paths
            Setting::make('hidden_paths', 'hidden_paths', '', ['nullable', 'string'])->label('Hidden paths')->help('One per line, such as /.cache or *.log. Hidden files and folders are not listed.')->tab('Paths')->textarea(5000)->frontend(),
            Setting::make('protected_paths', 'protected_paths', '', ['nullable', 'string'])->label('Protected paths')->help('One per line. Nobody can delete, rename or overwrite these through the panel\'s file browser. The file API itself is not changed.')->tab('Paths')->textarea(5000)->frontend(),
            Setting::make('protect_admins', 'protect_admins', false, ['required', 'boolean'])->label('Protect paths from admins too')->help('Off lets root admins change protected paths.')->tab('Paths')->field('toggle')->frontend(),

            // Keybinds
            Setting::make('keybinds', 'keybinds', self::DEFAULT_KEYBINDS, ['required', 'string', 'json'])->label('Default keybinds')->help('People can change their own when allowed.')->tab('Keybinds')->textarea(5000)->frontend(),
        ]));
    }
}
