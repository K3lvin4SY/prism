<?php

declare(strict_types=1);

namespace PrismConsole;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismConsoleProvider extends ExtensionProvider
{
    public const array LAYOUTS = ['classic' => 'Classic', 'dashboard' => 'Dashboard', 'side' => 'Side panel', 'monitor' => 'Monitor', 'focus' => 'Focus', 'compact' => 'Compact'];

    public const array FONTS = [
        'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Roboto Mono',
        'Ubuntu Mono', 'Inconsolata', 'Space Mono', 'DM Mono', 'System monospace',
    ];

    /** The built-in highlight rules, each on by default. Custom rules are added in Prism Properties. */
    public const string DEFAULT_HIGHLIGHTS = '{"builtin":{"errors":true,"warnings":true,"joins":true,"chat":true,"ready":true,"info":false,"debug":false,"ips":true},"custom":[]}';

    public function boot(): void
    {
        $this->registerApiRoutes();

        $options = static fn (array $values): array => array_map(static fn ($value, $label) => ['value' => is_int($value) ? $label : $value, 'label' => $label], array_keys($values), $values);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // General
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use PrismConsole')->help('Off puts the panel\'s own console back for everyone.')->tab('General')->field('toggle')->frontend(),
            Setting::make('full_width', 'full_width', true, ['required', 'boolean'])->label('Full width')->help('Let the console use the whole page instead of the panel\'s column.')->tab('General')->field('toggle')->frontend(),
            Setting::make('keep_header', 'keep_header', false, ['required', 'boolean'])->label('Keep the panel\'s header')->help('Keeps the server name and description above PrismConsole.')->tab('General')->field('toggle')->frontend(),
            Setting::make('floating_progress', 'floating_progress', true, ['required', 'boolean'])->label('Floating progress card')->help('Shows image pull and install progress on other server pages while it runs.')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_lines', 'max_lines', 1000, ['required', 'integer', 'min:200', 'max:20000'])->label('Lines kept in the browser')->help('Older lines are dropped as new ones arrive.')->tab('General')->field('number')->frontend(),
            Setting::make('history_limit', 'history_limit', 50, ['required', 'integer', 'min:10', 'max:500'])->label('Commands remembered per server')->tab('General')->field('number')->frontend(),
            Setting::make('allow_terminal_settings', 'allow_terminal_settings', true, ['required', 'boolean'])->label('Personal terminal settings')->help('Font, size, wrap, timestamps and the rest.')->tab('General')->field('toggle')->frontend(),
            Setting::make('allow_layouts', 'allow_layouts', true, ['required', 'boolean'])->label('Personal layouts')->help('People pick their own layout or arrange their own.')->tab('General')->field('toggle')->frontend(),
            Setting::make('allow_highlights', 'allow_highlights', true, ['required', 'boolean'])->label('Personal highlight rules')->tab('General')->field('toggle')->frontend(),
            Setting::make('allow_quick_commands', 'allow_quick_commands', true, ['required', 'boolean'])->label('Personal quick commands')->help('Users can add their own buttons.')->tab('General')->field('toggle')->frontend(),

            // Layout
            Setting::make('default_layout', 'default_layout', 'classic', ['required', 'string'])->label('Default layout')->help('The layout people see until they pick their own.')->tab('Layout')->field('select', $options(self::LAYOUTS))->frontend(),

            // Features
            Setting::make('feature_search', 'feature_search', true, ['required', 'boolean'])->label('Search')->help('Ctrl+F with regular expressions, match case and whole word.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_filters', 'feature_filters', true, ['required', 'boolean'])->label('Log level filters')->help('Show only errors, warnings, players, info, debug or system lines.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_export', 'feature_export', true, ['required', 'boolean'])->label('Export and copy')->help('Download the console as .txt, .log or coloured .html.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_charts', 'feature_charts', true, ['required', 'boolean'])->label('Live charts')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_quick_commands', 'feature_quick_commands', true, ['required', 'boolean'])->label('Quick commands')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_history_sync', 'feature_history_sync', true, ['required', 'boolean'])->label('Command history follows people')->help('Saves each person\'s history on the panel, so it is there in every browser.')->tab('Features')->field('toggle')->frontend(),
            Setting::make('feature_pull_progress', 'feature_pull_progress', true, ['required', 'boolean'])->label('Image pull progress')->help('Docker pull output becomes one progress card with speed and time left.')->tab('Features')->field('toggle')->frontend(),

            // Terminal
            Setting::make('default_font', 'default_font', 'JetBrains Mono', ['required', 'string'])->label('Font')->tab('Terminal')->field('select', array_map(static fn (string $font) => ['value' => $font, 'label' => $font], self::FONTS))->frontend(),
            Setting::make('default_font_size', 'default_font_size', 13, ['required', 'integer', 'min:9', 'max:24'])->label('Text size')->tab('Terminal')->field('number')->frontend(),
            Setting::make('default_line_height', 'default_line_height', '1.4', ['required', 'string'])->label('Line height')->tab('Terminal')->field('select', array_map(static fn (string $value) => ['value' => $value, 'label' => $value], ['1.2', '1.3', '1.4', '1.5', '1.7']))->frontend(),
            Setting::make('default_wrap', 'default_wrap', true, ['required', 'boolean'])->label('Wrap long lines')->tab('Terminal')->field('toggle')->frontend(),
            Setting::make('default_timestamps', 'default_timestamps', false, ['required', 'boolean'])->label('Show timestamps')->tab('Terminal')->field('toggle')->frontend(),

            // Highlights and quick commands, as JSON edited by Prism Properties.
            Setting::make('highlights', 'highlights', self::DEFAULT_HIGHLIGHTS, ['required', 'string', 'json'])->label('Highlight rules')->help('Colours errors, warnings, joins, chat and IP addresses, and any text or pattern you add, for everyone.')->tab('Highlights')->textarea(20000)->frontend(),
            Setting::make('quick_commands', 'quick_commands', '[]', ['required', 'string', 'json'])->label('Quick commands')->help('Buttons that send a command. Each can be limited to servers whose egg has a tag, and ask before it runs.')->tab('Quick commands')->textarea(20000)->frontend(),
        ]));
    }
}
