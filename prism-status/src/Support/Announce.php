<?php

declare(strict_types=1);

namespace PrismStatus\Support;

use PrismStatus\Models\Incident;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Shows an incident as Prism Layout's announcement, and takes it down again. Only what Prism
 * Status wrote is ever undone: an announcement changed by hand since is left alone.
 */
final class Announce
{
    private const array KEYS = ['announce_text', 'announce_badge', 'announce_level', 'announce_link', 'announce_link_label', 'announce_from', 'announce_until'];

    private const array LEVELS = ['maintenance' => 'info', 'minor' => 'warning', 'major' => 'danger'];

    private const array BADGES = ['maintenance' => 'Maintenance', 'minor' => 'Incident', 'major' => 'Outage'];

    public static function available(): bool
    {
        return self::layout() !== null;
    }

    public static function show(Incident $incident, string $latest): void
    {
        $layout = self::layout();
        if ($layout === null) {
            return;
        }

        // Only keys Prism Layout had stored are put back; the others are forgotten again, so its defaults apply as before.
        $stored = self::stored();
        $before = $incident->announcement['before'] ?? array_intersect_key($stored, array_flip(self::KEYS));
        $text = $incident->title.($latest !== '' ? ': '.$latest : '');
        $written = [
            'announce_text' => mb_strimwidth($text, 0, 300, '…'),
            'announce_badge' => self::BADGES[$incident->impact] ?? 'Incident',
            'announce_level' => self::LEVELS[$incident->impact] ?? 'warning',
            'announce_link' => '/status',
            'announce_link_label' => 'Status page',
            'announce_from' => '',
            'announce_until' => '',
        ];

        try {
            $layout->update($written);
            $incident->forceFill(['announcement' => ['written' => $written, 'before' => $before]])->save();
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    public static function clear(Incident $incident): void
    {
        $announcement = $incident->announcement;
        if (! is_array($announcement)) {
            return;
        }
        $layout = self::layout();
        if ($layout !== null && $layout->get('announce_text') === ($announcement['written']['announce_text'] ?? null)) {
            try {
                $before = $announcement['before'] ?? [];
                $layout->update(array_map(static fn (mixed $value): mixed => $value ?? '', $before));
                $settings = new ExtensionSettings('prism-layout');
                foreach (array_diff(self::KEYS, array_keys($before)) as $key) {
                    $settings->forget($key);
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        }
        $incident->forceFill(['announcement' => null])->save();
    }

    /** Prism Layout's panel-wide settings that have a stored value. */
    private static function stored(): array
    {
        try {
            return (new ExtensionSettings('prism-layout'))->all();
        } catch (Throwable) {
            return [];
        }
    }

    private static function layout(): ?ExtensionSettingsDefinition
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get('prism-layout');
        } catch (Throwable) {
            return null;
        }
    }
}
