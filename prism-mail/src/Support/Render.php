<?php

declare(strict_types=1);

namespace PrismMail\Support;

use PrismMail\Models\Template;
use Pterodactyl\Services\Extensions\ExtensionSettingFiles;

/** What Prism's mail view shows: the panel's lines with the admin's wording laid over them, and the branding. */
final class Render
{
    public const string DEFAULT_COLOR = '#3869d4';

    /** Mail clients rarely draw SVG, WebP or AVIF, so only these logos are used in emails. */
    private const string MAIL_IMAGE = '/\.(?:png|jpg|gif)\z/';

    public static function enabled(): bool
    {
        return Settings::bool('enabled');
    }

    /**
     * @param  list<string>  $introLines
     * @param  list<string>  $outroLines
     */
    public static function prepare(?string $greeting, array $introLines, ?string $actionText, array $outroLines, string $level): array
    {
        $template = Current::template();
        $values = Catalogue::values(Current::notification(), Current::notifiable());
        $fill = static fn (?string $text): string => self::fill((string) $text, $values);
        $panel = $values['panel'];

        if ($template !== null) {
            $greeting = filled($template->greeting) ? $fill($template->greeting) : $greeting;
            $introLines = filled($template->intro) ? self::lines($fill($template->intro)) : $introLines;
            $actionText = $actionText !== null && filled($template->action) ? $fill($template->action) : $actionText;
            $outroLines = filled($template->outro) ? self::lines($fill($template->outro)) : $outroLines;
        }

        $color = self::color();

        return [
            'greeting' => filled($greeting) ? $greeting : ($level === 'error' ? 'Whoops!' : 'Hello!'),
            'introLines' => $introLines,
            'actionText' => $actionText,
            'outroLines' => $outroLines,
            'color' => $color,
            'button' => match ($level) {
                'success' => '#22bc66',
                'error' => '#dc4d2f',
                default => $color,
            },
            'logo' => self::logo(),
            'header' => $fill(Settings::string('header_text')) ?: $panel,
            'signOff' => Settings::string('sign_off'),
            'footer' => $fill(Settings::string('footer_text')) ?: '© '.date('Y').' '.$panel.'. All rights reserved.',
            'panel' => $panel,
        ];
    }

    /** An email's subject with the admin's own laid over it, or null to keep the panel's. */
    public static function subject(?Template $template): ?string
    {
        if ($template === null || blank($template->subject)) {
            return null;
        }

        return self::fill($template->subject, Catalogue::values(Current::notification(), Current::notifiable()));
    }

    /** @param array<string, string> $values */
    public static function fill(string $text, array $values): string
    {
        $pairs = [];
        foreach ($values as $key => $value) {
            $pairs['{'.$key.'}'] = $value;
        }

        return trim(strtr($text, $pairs));
    }

    /** @return list<string> */
    private static function lines(string $text): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\R/', $text) ?: []), static fn (string $line): bool => $line !== ''));
    }

    private static function color(): string
    {
        $color = Settings::string('brand_color');

        return preg_match('/\A#[0-9a-fA-F]{6}\z/', $color) === 1 ? $color : self::DEFAULT_COLOR;
    }

    /** The logo's full address: Prism Mail's own, else Prism Layout's when allowed. */
    private static function logo(): ?string
    {
        $own = Settings::get('logo');
        if (is_string($own) && self::usable($own)) {
            return url(ExtensionSettingFiles::url(Settings::EXTENSION, $own));
        }
        if (! Settings::bool('layout_logo')) {
            return null;
        }
        $layout = Settings::from('prism-layout', 'logo');

        return is_string($layout) && self::usable($layout) ? url(ExtensionSettingFiles::url('prism-layout', $layout)) : null;
    }

    private static function usable(string $name): bool
    {
        return preg_match(ExtensionSettingFiles::NAME_PATTERN, $name) === 1 && preg_match(self::MAIL_IMAGE, $name) === 1;
    }
}
