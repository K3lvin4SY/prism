<?php

declare(strict_types=1);

namespace PrismStatus\Support;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use PrismStatus\Models\Component;
use PrismStatus\Models\Day;
use PrismStatus\Models\Incident;
use PrismStatus\Models\Update;
use Pterodactyl\Services\Extensions\ExtensionSettingFiles;

/**
 * What the public status page shows. Only names the admin chose and Prism's own ids: never a
 * node's address, a server's uuid or anything else from the panel.
 */
final class Summary
{
    private const string CACHE = 'prism-status:summary';

    /** Resolved incidents stay on the page this long. */
    private const int RECENT_DAYS = 14;

    public static function get(): array
    {
        return Cache::remember(self::CACHE, 30, self::build(...));
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE);
    }

    public static function build(): array
    {
        $history = Settings::historyDays();
        $first = CarbonImmutable::now()->subDays($history - 1)->startOfDay();
        $components = Component::query()->orderBy('group')->orderBy('sort')->orderBy('id')->get();
        $days = Day::query()->whereIn('component_id', $components->pluck('id'))->where('day', '>=', $first->toDateString())->get()->groupBy('component_id');

        $active = Incident::query()->with('updates')->whereNull('resolved_at')->orderByDesc('id')->get();
        $recent = Incident::query()->with('updates')->whereNotNull('resolved_at')->where('resolved_at', '>=', now()->subDays(self::RECENT_DAYS))->orderByDesc('resolved_at')->limit(10)->get();

        $presented = $components->map(static function (Component $component) use ($days, $first, $history): array {
            $tally = ($days->get($component->id) ?? collect())->keyBy(static fn (Day $day): string => substr((string) $day->day, 0, 10));
            $checks = 0;
            $up = 0;
            $bars = [];
            for ($i = 0; $i < $history; $i++) {
                $date = $first->addDays($i)->toDateString();
                $day = $tally->get($date);
                $bars[] = $day !== null && $day->checks > 0 ? round($day->up / $day->checks, 4) : null;
                $checks += $day?->checks ?? 0;
                $up += $day?->up ?? 0;
            }

            return [
                'id' => $component->id,
                'label' => $component->label,
                'group' => $component->group,
                'state' => self::publicState($component->state),
                'uptime' => $checks > 0 ? round($up / $checks * 100, 2) : null,
                'days' => $bars,
            ];
        })->values()->all();

        return [
            'title' => Settings::string('title') ?: config('app.name').' status',
            'intro' => Settings::string('intro'),
            'logo' => self::logo(),
            'overall' => self::overall($presented, $active->all()),
            'first_day' => $first->toDateString(),
            'components' => $presented,
            'incidents' => [
                'active' => $active->map(self::incident(...))->values()->all(),
                'recent' => $recent->map(self::incident(...))->values()->all(),
            ],
            'updated_at' => now()->toIso8601String(),
        ];
    }

    public static function incident(Incident $incident): array
    {
        return [
            'id' => $incident->id,
            'title' => $incident->title,
            'impact' => $incident->impact,
            'status' => $incident->status,
            'components' => array_values(array_map('intval', $incident->components ?? [])),
            'started_at' => $incident->created_at->toIso8601String(),
            'resolved_at' => $incident->resolved_at?->toIso8601String(),
            'updates' => $incident->updates->map(static fn (Update $update): array => [
                'id' => $update->id,
                'status' => $update->status,
                'body' => $update->body,
                'created_at' => $update->created_at->toIso8601String(),
            ])->values()->all(),
        ];
    }

    /** Starting reads as degraded; the rest as they are. */
    public static function publicState(string $state): string
    {
        return match ($state) {
            'up' => 'up',
            'starting' => 'degraded',
            'down' => 'down',
            'maintenance' => 'maintenance',
            default => 'unknown',
        };
    }

    /**
     * @param  list<array{state: string}>  $components
     * @param  list<Incident>  $active
     */
    private static function overall(array $components, array $active): string
    {
        $impacts = array_map(static fn (Incident $incident): string => $incident->impact, $active);
        $states = array_column($components, 'state');

        return match (true) {
            in_array('major', $impacts, true), in_array('down', $states, true) => 'major',
            in_array('minor', $impacts, true), in_array('degraded', $states, true) => 'minor',
            in_array('maintenance', $impacts, true), in_array('maintenance', $states, true) => 'maintenance',
            default => 'ok',
        };
    }

    /** Prism Layout's public logo, when it has one and the setting allows. */
    private static function logo(): ?string
    {
        if (! Settings::bool('layout_logo')) {
            return null;
        }
        $name = Settings::from('prism-layout', 'logo');

        return is_string($name) && preg_match(ExtensionSettingFiles::NAME_PATTERN, $name) === 1 ? ExtensionSettingFiles::url('prism-layout', $name) : null;
    }
}
