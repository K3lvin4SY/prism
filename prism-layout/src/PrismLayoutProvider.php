<?php

declare(strict_types=1);

namespace PrismLayout;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingFiles;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismLayoutProvider extends ExtensionProvider
{
    private const array IMAGES = [...ExtensionSettingFiles::IMAGES, 'image/svg+xml'];

    private const array FAVICON_TYPES = ['image/png', 'image/x-icon', 'image/svg+xml', 'image/webp', 'image/gif'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $options = static fn (array $values): array => array_map(static fn ($value, $label) => ['value' => $value, 'label' => $label], array_keys($values), $values);
        $toggle = static fn (string $key, bool $default, string $label, string $tab, ?string $help = null): Setting => tap(
            Setting::make($key, $key, $default, ['required', 'boolean'])->label($label)->tab($tab)->field('toggle')->frontend()->frontendType('boolean'),
            static fn (Setting $setting) => $help === null ? null : $setting->help($help),
        );
        $text = static fn (string $key, string $default, int $max, string $label, string $tab, ?string $help = null): Setting => tap(
            Setting::make($key, $key, $default, ['nullable', 'string', 'max:'.$max])->label($label)->tab($tab)->field('text')->frontend(),
            static fn (Setting $setting) => $help === null ? null : $setting->help($help),
        );

        $settings = [
            // Navigation
            $toggle('enabled', true, 'Use Prism Layout', 'Navigation', 'Off gives the panel its own layout back, keeping the logo, favicon and sign-in page.'),
            Setting::make('bars', 'bars', 'sidebar', ['required', 'string', 'in:sidebar,top,dock,sidebar_top,rail,rail_top,top_dock'])->label('Navigation')->tab('Navigation')->field('select', $options(['sidebar' => 'Sidebar', 'top' => 'Top bar', 'dock' => 'Dock', 'sidebar_top' => 'Sidebar and top bar', 'rail' => 'Icon rail', 'rail_top' => 'Icon rail and top bar', 'top_dock' => 'Top bar and dock']))->frontend(),
            Setting::make('sidebar_width', 'sidebar_width', 16, ['required', 'integer', 'min:12', 'max:22'])->label('Sidebar width')->help('In rem; 16 is about 256 pixels.')->tab('Navigation')->field('number')->frontend(),
            $toggle('dock_magnify', true, 'Dock icons grow under the pointer', 'Navigation'),
            $toggle('group_nav', true, 'Group the server pages', 'Navigation', 'Manage, Files and data, and Configuration.'),
            $toggle('server_card', true, 'Server card in the sidebar', 'Navigation', "The open server's status and power buttons above its pages."),
            $toggle('scheme_switch', true, 'Light and dark switch', 'Navigation', 'When the theme has both.'),
            $toggle('admin_styled', true, 'Lay out the admin area too', 'Navigation', "Off keeps the admin area in the panel's own layout."),

            // Page
            Setting::make('width', 'width', 'normal', ['required', 'string', 'in:normal,wide,full'])->label('Page width')->tab('Page')->field('select', $options(['normal' => 'Normal', 'wide' => 'Wide', 'full' => 'Full width']))->frontend(),
            Setting::make('density', 'density', 'cozy', ['required', 'string', 'in:compact,cozy,comfortable'])->label('Spacing')->tab('Page')->field('select', $options(['compact' => 'Compact', 'cozy' => 'Cozy', 'comfortable' => 'Comfortable']))->frontend(),

            // Server cards
            Setting::make('cards', 'cards', 'banner', ['required', 'string', 'in:banner,tile,neon,minimal,compact,outline,rows'])->label('Server cards')->tab('Server cards')->field('select', $options(['banner' => 'Banner', 'tile' => 'Tile', 'neon' => 'Neon', 'minimal' => 'Minimal', 'compact' => 'Compact', 'outline' => 'Outline', 'rows' => 'Rows']))->frontend(),
            Setting::make('status_style', 'status_style', 'badge', ['required', 'string', 'in:badge,dot,bar'])->label('Status')->tab('Server cards')->field('select', $options(['badge' => 'Badge', 'dot' => 'Dot', 'bar' => 'Coloured edge']))->frontend(),
            Setting::make('usage_style', 'usage_style', 'bars', ['required', 'string', 'in:bars,numbers,hidden'])->label('Usage')->tab('Server cards')->field('select', $options(['bars' => 'Bars', 'numbers' => 'Numbers', 'hidden' => 'Hidden']))->frontend(),
            $toggle('egg_colors', true, 'Colour cards by game', 'Server cards', 'Each egg tag gets its own colour.'),
            $toggle('power_buttons', true, 'Power buttons on cards', 'Server cards'),
            Setting::make('card_image', 'card_image', null)->label('Card picture')->help("Shown on Banner cards. Without one, a pattern in the game's colour.")->tab('Server cards')->file(self::IMAGES, 2048)->frontend(),

            // Branding: everything here also reaches the sign-in pages.
            Setting::make('logo', 'logo', null)->label('Logo')->help('PNG, JPG, WebP or SVG, up to 1 MB. A wide logo works best in a top bar.')->tab('Branding')->file(self::IMAGES, 1024)->frontend()->public(),
            Setting::make('logo_mode', 'logo_mode', 'instead', ['required', 'string', 'in:beside,instead,name'])->label('Show the logo')->help('Beside the company name, instead of it, or show only the name.')->tab('Branding')->field('select', $options(['beside' => 'Beside the name', 'instead' => 'Instead of the name', 'name' => 'Name only']))->frontend()->public(),
            Setting::make('logo_height', 'logo_height', 32, ['required', 'integer', 'min:16', 'max:64'])->label('Logo height')->tab('Branding')->field('number')->frontend()->public(),
            Setting::make('logo_square', 'logo_square', null)->label('Square logo')->help('Used where there is only room for an icon, such as the icon rail.')->tab('Branding')->file(self::IMAGES, 1024)->frontend()->public(),
            Setting::make('favicon', 'favicon', null)->label('Favicon')->help('The icon in the browser tab. A square PNG, ICO or SVG, up to 512 KB.')->tab('Branding')->file(self::FAVICON_TYPES, 512)->frontend()->public(),

            // Sign-in page
            Setting::make('login_style', 'login_style', 'card', ['required', 'string', 'in:card,split,backdrop'])->label('Sign-in page')->help("Card is the panel's own; split puts a picture beside the form; backdrop puts it behind.")->tab('Sign-in page')->field('select', $options(['card' => 'Card', 'split' => 'Split with a picture', 'backdrop' => 'Picture behind']))->frontend()->public(),
            Setting::make('login_mark', 'login_mark', 'logo', ['required', 'string', 'in:logo,mascot,none'])->label('Beside the form')->help('Your logo, the Pterodactyl mascot, or nothing. Without a logo the mascot stays.')->tab('Sign-in page')->field('select', $options(['logo' => 'Your logo', 'mascot' => 'The mascot', 'none' => 'Nothing']))->frontend()->public(),
            Setting::make('login_logo_size', 'login_logo_size', 160, ['required', 'integer', 'min:48', 'max:320'])->label('Logo size on the sign-in pages')->tab('Sign-in page')->field('number')->frontend()->public(),
            Setting::make('login_tagline', 'login_tagline', '', ['nullable', 'string', 'max:120'])->label('Tagline')->help('A line above the form, or on the picture when it is split.')->tab('Sign-in page')->field('text')->frontend()->public(),
            Setting::make('login_image', 'login_image', null)->label('Sign-in picture')->help('For the split and backdrop styles. Without one, a gradient in the theme colour.')->tab('Sign-in page')->file(self::IMAGES, 4096)->frontend()->public(),

            // Announcement
            $text('announce_text', '', 300, 'Message', 'Announcement', 'Empty shows no banner.'),
            Setting::make('announce_level', 'announce_level', 'info', ['required', 'string', 'in:info,success,warning,danger'])->label('Kind')->tab('Announcement')->field('select', $options(['info' => 'Information', 'success' => 'Good news', 'warning' => 'Warning', 'danger' => 'Problem']))->frontend(),
            Setting::make('announce_style', 'announce_style', 'bar', ['required', 'string', 'in:bar,card'])->label('Style')->tab('Announcement')->field('select', $options(['bar' => 'Bar across the top', 'card' => 'Card above the page']))->frontend(),
            Setting::make('announce_audience', 'announce_audience', 'everyone', ['required', 'string', 'in:everyone,admins,users'])->label('Shown to')->tab('Announcement')->field('select', $options(['everyone' => 'Everyone', 'admins' => 'Administrators', 'users' => 'Everyone but administrators']))->frontend(),
            $text('announce_link', '', 300, 'Button link', 'Announcement'),
            $text('announce_link_label', 'Read more', 40, 'Button text', 'Announcement'),
            $text('announce_from', '', 20, 'Show from', 'Announcement', 'A date and time such as 2026-11-01 08:00. Empty shows it now.'),
            $text('announce_until', '', 20, 'Show until', 'Announcement', 'Empty shows it until you clear the message.'),
            $toggle('announce_dismiss', true, 'People can close it', 'Announcement', 'Closed stays closed in that browser until the message changes.'),
        ];

        // Links
        foreach ([1, 2, 3] as $n) {
            $settings[] = $text("link{$n}_label", '', 40, "Link {$n} text", 'Links');
            $settings[] = $text("link{$n}_url", '', 300, "Link {$n} address", 'Links', $n === 1 ? 'Shown at the foot of the navigation, such as your Discord or store.' : null);
        }

        // Advanced
        $settings[] = $toggle('command_palette', true, 'Ctrl+K command palette', 'Advanced', 'Jump to any server, page or setting from the keyboard, or with the ⌘ button.');

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), $settings));

        // The favicon replaces the panel's own icons for everyone, signed in or not.
        $this->registerHeadTags(function (): array {
            // Stored as the file's name; a default would be a URL already.
            $name = $this->settings()->get('favicon');
            if (! is_string($name) || $name === '') {
                return [];
            }

            $url = preg_match(ExtensionSettingFiles::NAME_PATTERN, $name) === 1 ? ExtensionSettingFiles::url('prism-layout', $name) : $name;
            $type = match (mb_strtolower(pathinfo($url, PATHINFO_EXTENSION))) {
                'svg' => 'image/svg+xml',
                'ico' => 'image/x-icon',
                'webp' => 'image/webp',
                'gif' => 'image/gif',
                default => 'image/png',
            };

            return [
                ['tag' => 'link', 'rel' => 'icon', 'href' => $url, 'type' => $type],
                ['tag' => 'link', 'rel' => 'shortcut icon', 'href' => $url],
                ['tag' => 'link', 'rel' => 'apple-touch-icon', 'href' => $url],
            ];
        });
    }
}
