<?php

declare(strict_types=1);

namespace PrismBranding;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingFiles;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismBrandingProvider extends ExtensionProvider
{
    private const array LOGO_TYPES = [...ExtensionSettingFiles::IMAGES, 'image/svg+xml'];

    private const array FAVICON_TYPES = ['image/png', 'image/x-icon', 'image/svg+xml', 'image/webp', 'image/gif'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $options = static fn (array $values): array => array_map(static fn ($value, $label) => ['value' => $value, 'label' => $label], array_keys($values), $values);

        // Everything is public: the sign-in pages need it before anyone has signed in.
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // Logo
            Setting::make('logo', 'logo', null)->label('Logo')->help('PNG, JPG, WebP or SVG, up to 1 MB. A wide logo works best in the top bar.')->tab('Logo')->file(self::LOGO_TYPES, 1024)->frontend()->public(),
            Setting::make('logo_mode', 'logo_mode', 'instead', ['required', 'string', 'in:beside,instead,name'])->label('Show the logo')->help('Beside the company name, instead of it, or show only the name.')->tab('Logo')->field('select', $options(['beside' => 'Beside the name', 'instead' => 'Instead of the name', 'name' => 'Name only']))->frontend()->public(),
            Setting::make('logo_height', 'logo_height', 32, ['required', 'integer', 'min:16', 'max:64'])->label('Logo height')->tab('Logo')->field('number')->frontend()->public(),
            Setting::make('logo_square', 'logo_square', null)->label('Square logo')->help('Used where there is only room for an icon, such as a collapsed sidebar in Prism Themes.')->tab('Logo')->file(self::LOGO_TYPES, 1024)->frontend()->public(),

            // Sign-in pages
            Setting::make('login_mark', 'login_mark', 'logo', ['required', 'string', 'in:logo,mascot,none'])->label('Beside the sign-in form')->help('Your logo, the Pterodactyl mascot, or nothing. Without a logo uploaded the mascot stays.')->tab('Sign-in pages')->field('select', $options(['logo' => 'Your logo', 'mascot' => 'The mascot', 'none' => 'Nothing']))->frontend()->public(),
            Setting::make('login_logo_size', 'login_logo_size', 160, ['required', 'integer', 'min:48', 'max:320'])->label('Logo size on the sign-in pages')->tab('Sign-in pages')->field('number')->frontend()->public(),

            // Favicon
            Setting::make('favicon', 'favicon', null)->label('Favicon')->help('The icon in the browser tab. A square PNG, ICO or SVG, up to 512 KB.')->tab('Favicon')->file(self::FAVICON_TYPES, 512)->frontend()->public(),
        ]));

        // The favicon replaces the panel's own icons for everyone, signed in or not.
        $this->registerHeadTags(function (): array {
            // Stored as the file's name; a default would be a URL already.
            $name = $this->settings()->get('favicon');
            if (! is_string($name) || $name === '') {
                return [];
            }

            $url = preg_match(ExtensionSettingFiles::NAME_PATTERN, $name) === 1 ? ExtensionSettingFiles::url('prism-branding', $name) : $name;

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
