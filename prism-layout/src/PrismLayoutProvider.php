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

    /** The navigation layouts, for computers, tablets and phones alike. */
    private const array BARS = [
        'sidebar' => 'Sidebar',
        'top' => 'Top bar',
        'dock' => 'Dock',
        'dock_expand' => 'Expandable dock',
        'sidebar_top' => 'Sidebar and top bar',
        'rail' => 'Icon rail',
        'rail_top' => 'Icon rail and top bar',
        'top_dock' => 'Top bar and dock',
    ];

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
            Setting::make('bars', 'bars', 'sidebar_top', ['required', 'string', 'in:'.implode(',', array_keys(self::BARS))])->label('Navigation on computers')->help('Screens 1024 pixels wide and more.')->tab('Navigation')->field('select', $options(self::BARS))->frontend(),
            Setting::make('bars_tablet', 'bars_tablet', 'top_dock', ['required', 'string', 'in:'.implode(',', array_keys(self::BARS))])->label('Navigation on tablets')->help('Screens 768 to 1023 pixels wide.')->tab('Navigation')->field('select', $options(self::BARS))->frontend(),
            Setting::make('bars_mobile', 'bars_mobile', 'dock_expand', ['required', 'string', 'in:'.implode(',', array_keys(self::BARS))])->label('Navigation on phones')->help('Screens narrower than 768 pixels. A sidebar or icon rail opens from a menu button there.')->tab('Navigation')->field('select', $options(self::BARS))->frontend(),
            Setting::make('sidebar_width', 'sidebar_width', 14, ['required', 'integer', 'min:12', 'max:22'])->label('Sidebar width')->help('In rem; 16 is about 256 pixels.')->tab('Navigation')->field('number')->frontend(),
            $toggle('dock_magnify', true, 'Dock icons grow under the pointer', 'Navigation'),
            $toggle('group_nav', true, 'Group the server pages', 'Navigation', 'Manage, Files and data, and Configuration.'),
            $toggle('server_card', true, 'Server card in the sidebar', 'Navigation', "The open server's status and power buttons above its pages."),
            $toggle('scheme_switch', true, 'Light and dark switch', 'Navigation', 'When the theme has both.'),
            $toggle('admin_styled', true, 'Lay out the admin area too', 'Navigation', "Off keeps the admin area in the panel's own layout."),
            $toggle('dashboard_panel', true, 'Overview and filters on the dashboard', 'Navigation', 'The sidebar shows how your servers are doing, filters for the cards and your recent servers.'),
            $toggle('sidebar_collapse', true, 'People can collapse the sidebar', 'Navigation', "A button folds the sidebar into an icon rail and back; each person's choice is remembered in their browser."),

            // Page
            Setting::make('width', 'width', 'normal', ['required', 'string', 'in:normal,wide,full'])->label('Page width')->tab('Page')->field('select', $options(['normal' => 'Normal', 'wide' => 'Wide', 'full' => 'Full width']))->frontend(),
            Setting::make('density', 'density', 'cozy', ['required', 'string', 'in:compact,cozy,comfortable'])->label('Spacing')->tab('Page')->field('select', $options(['compact' => 'Compact', 'cozy' => 'Cozy', 'comfortable' => 'Comfortable']))->frontend(),

            // Server cards
            Setting::make('cards', 'cards', 'rows', ['required', 'string', 'in:rows,tile'])->label('Server cards')->help('Rows line every server up in one list; tiles put each in a card of its own.')->tab('Server cards')->field('select', $options(['rows' => 'Rows', 'tile' => 'Tiles']))->frontend(),
            $toggle('card_banner', false, 'Picture on tiles', 'Server cards', "A picture across the top of each tile: the server's own, its egg's, or the card picture below."),
            Setting::make('status_style', 'status_style', 'badge', ['required', 'string', 'in:badge,dot,bar'])->label('Status')->tab('Server cards')->field('select', $options(['badge' => 'Badge', 'dot' => 'Dot', 'bar' => 'Colored edge']))->frontend(),
            Setting::make('usage_style', 'usage_style', 'bars', ['required', 'string', 'in:bars,numbers,hidden'])->label('Usage')->help('Bars or numbers; on rows, numbers keep the list narrow.')->tab('Server cards')->field('select', $options(['bars' => 'Bars', 'numbers' => 'Numbers', 'hidden' => 'Hidden']))->frontend(),
            Setting::make('egg_colors', 'egg_colors', 'logo', ['required', 'string', 'in:none,color,logo'])->label('Show the game on cards')->help("Color gives each egg tag its own color. Logo puts the egg's logo on the cards, set for each egg below.")->tab('Server cards')->field('select', $options(['none' => 'None', 'color' => 'Color', 'logo' => 'Logo']))->frontend(),
            $toggle('power_buttons', true, 'Power buttons on cards', 'Server cards'),
            Setting::make('card_image', 'card_image', null)->label('Card picture')->help("Shown on tiles with a picture when the server and its egg have none. Without one, a pattern in the game's color.")->tab('Server cards')->file(self::IMAGES, 2048)->frontend(),

            // Branding: everything here also reaches the sign-in pages.
            Setting::make('logo', 'logo', null)->label('Logo')->help('PNG, JPG, WebP or SVG, up to 1 MB. A wide logo works best in a top bar.')->tab('Branding')->file(self::IMAGES, 1024)->frontend()->public(),
            Setting::make('logo_mode', 'logo_mode', 'name', ['required', 'string', 'in:beside,instead,name'])->label('Show the logo')->help('Beside the company name, instead of it, or show only the name.')->tab('Branding')->field('select', $options(['beside' => 'Beside the name', 'instead' => 'Instead of the name', 'name' => 'Name only']))->frontend()->public(),
            Setting::make('brand_place', 'brand_place', 'sidebar', ['required', 'string', 'in:top,sidebar'])->label('Logo and name')->help('Where they go when the layout has both a top bar and a sidebar or icon rail.')->tab('Branding')->field('select', $options(['top' => 'In the top bar', 'sidebar' => 'At the top of the sidebar']))->frontend(),
            Setting::make('logo_height', 'logo_height', 32, ['required', 'integer', 'min:16', 'max:64'])->label('Logo height')->tab('Branding')->field('number')->frontend()->public(),
            Setting::make('logo_square', 'logo_square', null)->label('Square logo')->help('Used where there is only room for an icon, such as the icon rail.')->tab('Branding')->file(self::IMAGES, 1024)->frontend()->public(),
            Setting::make('favicon', 'favicon', null)->label('Favicon')->help('The icon in the browser tab. A square PNG, ICO or SVG, up to 512 KB.')->tab('Branding')->file(self::FAVICON_TYPES, 512)->frontend()->public(),

            // Sign-in page
            Setting::make('login_style', 'login_style', 'backdrop', ['required', 'string', 'in:card,split,backdrop'])->label('Sign-in page')->help("Card is the panel's own; split puts a picture beside the form; backdrop puts it behind.")->tab('Sign-in page')->field('select', $options(['card' => 'Card', 'split' => 'Split with a picture', 'backdrop' => 'Picture behind']))->frontend()->public(),
            Setting::make('login_mark', 'login_mark', 'logo', ['required', 'string', 'in:logo,mascot,none'])->label('Beside the form')->help('Your logo, the Pterodactyl mascot, or nothing. Without a logo the mascot stays. A split page shows the logo on its picture side instead.')->tab('Sign-in page')->field('select', $options(['logo' => 'Your logo', 'mascot' => 'The mascot', 'none' => 'Nothing']))->frontend()->public(),
            Setting::make('login_logo_size', 'login_logo_size', 160, ['required', 'integer', 'min:48', 'max:320'])->label('Logo size on the sign-in pages')->tab('Sign-in page')->field('number')->frontend()->public(),
            Setting::make('login_title', 'login_title', '', ['nullable', 'string', 'max:80'])->label('Headline')->help('Bold, beside the form when the page is split, else above it.')->tab('Sign-in page')->field('text')->frontend()->public(),
            Setting::make('login_subtitle', 'login_subtitle', '', ['nullable', 'string', 'max:160'])->label('Tagline')->help('A quieter line under the headline.')->tab('Sign-in page')->field('text')->frontend()->public(),
            Setting::make('login_image', 'login_image', null)->label('Sign-in picture')->help('For the split and backdrop styles. Without one, split uses a calm panel in the theme colors and backdrop a gradient.')->tab('Sign-in page')->file(self::IMAGES, 4096)->frontend()->public(),

            // Announcement
            $text('announce_text', '', 300, 'Message', 'Announcement', 'Empty shows no banner.'),
            $text('announce_badge', '', 24, 'Badge', 'Announcement', 'A short word before the message, such as Maintenance. Empty shows none.'),
            Setting::make('announce_level', 'announce_level', 'info', ['required', 'string', 'in:info,success,warning,danger'])->label('Kind')->tab('Announcement')->field('select', $options(['info' => 'Information', 'success' => 'Good news', 'warning' => 'Warning', 'danger' => 'Problem']))->frontend(),
            Setting::make('announce_style', 'announce_style', 'bar', ['required', 'string', 'in:bar,card'])->label('Style')->tab('Announcement')->field('select', $options(['bar' => 'Bar across the top', 'card' => 'Card above the page']))->frontend(),
            Setting::make('announce_audience', 'announce_audience', 'everyone', ['required', 'string', 'in:everyone,admins,users'])->label('Shown to')->tab('Announcement')->field('select', $options(['everyone' => 'Everyone', 'admins' => 'Administrators', 'users' => 'Everyone but administrators']))->frontend(),
            $text('announce_link', '', 300, 'Link', 'Announcement'),
            $text('announce_link_label', 'Details', 40, 'Link text', 'Announcement'),
            $text('announce_from', '', 40, 'Show from', 'Announcement', 'Empty shows it straight away.'),
            $text('announce_until', '', 40, 'Show until', 'Announcement', 'Empty shows it until you clear the message.'),
            $toggle('announce_dismiss', true, 'People can close it', 'Announcement', 'Closed stays closed in that browser until the message changes.'),
        ];

        // Links
        foreach ([1, 2, 3] as $n) {
            $settings[] = $text("link{$n}_label", '', 40, "Link {$n} text", 'Links');
            $settings[] = $text("link{$n}_url", '', 300, "Link {$n} address", 'Links', $n === 1 ? 'Shown at the foot of the navigation, such as your Discord or store.' : null);
        }

        // Advanced
        $settings[] = $toggle('command_palette', true, 'Command palette', 'Advanced', 'Jump to any server, page or setting from the keyboard, or with the ⌘ button.');
        $settings[] = Setting::make('palette_shortcut', 'palette_shortcut', 'mod+k', ['required', 'string', 'max:16', 'regex:/^(mod\+)?([a-z0-9\/.,;\-=]|f[1-9]|f1[0-2])$/'])->label('Command palette shortcut')->help('Ctrl (⌘ on a Mac) and one key, or a key alone. Keys typed in a text field never open it.')->tab('Advanced')->field('text')->frontend();

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
