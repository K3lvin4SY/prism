<?php

declare(strict_types=1);

namespace PrismTweaks\Support;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use InvalidArgumentException;
use Pterodactyl\Enum\ResourceLimit;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Throwable;

/**
 * Puts Prism Tweaks' settings into effect. It runs when the extension boots, which is after
 * the panel has set up its own rate limiters and config, so what is registered here replaces
 * the panel's. Nothing in the panel's files or .env changes; disabling the extension puts the
 * panel's own behavior back on the next request.
 */
final class ApplyTweaks
{
    public const string EXTENSION = 'prism-tweaks';

    /** The saved settings, with "not saved" as the default of each. @return array<string, mixed> */
    public static function settings(): array
    {
        try {
            return (new ExtensionSettings(self::EXTENSION))->all();
        } catch (Throwable) {
            // Before the panel's tables exist (installing, migrating) there is nothing to apply.
            return [];
        }
    }

    public static function apply(): void
    {
        $settings = self::settings();

        foreach (self::config($settings) as $key => $value) {
            config()->set($key, $value);
        }

        $users = Limits::users($settings['user_limits'] ?? null);
        foreach (Limits::APIS as $api) {
            RateLimiter::for("api.{$api}", static fn (Request $request): Limit => self::apiLimit($request, $api, $settings, $users));
        }

        foreach (ResourceLimit::cases() as $case) {
            if (! isset(Limits::RESOURCES[$case->name])) {
                continue;
            }
            RateLimiter::for($case->throttleKey(), static fn (Request $request): Limit => self::resourceLimit($request, $case, $settings));
        }
    }

    /**
     * The config values the settings change, keyed by config key. A setting left at 0 (or "the
     * panel's") is not listed, so the panel keeps its own value.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public static function config(array $settings): array
    {
        $changes = [];

        if (($minutes = Limits::positive($settings['session_minutes'] ?? null)) !== null) {
            $changes['session.lifetime'] = min($minutes, 525600);
        }
        if (($days = Limits::positive($settings['activity_days'] ?? null)) !== null) {
            $changes['activity.prune_days'] = min($days, 3650);
        }
        $hide = $settings['hide_admin_activity'] ?? 'panel';
        if ($hide === 'on' || $hide === 'off') {
            $changes['activity.hide_admin_activity'] = $hide === 'on';
        }
        if (($megabytes = Limits::positive($settings['max_edit_mb'] ?? null)) !== null) {
            $changes['pterodactyl.files.max_edit_size'] = min($megabytes, 512) * 1024 * 1024;
        }
        if (($tasks = Limits::positive($settings['schedule_task_limit'] ?? null)) !== null) {
            $changes['pterodactyl.client_features.schedules.per_schedule_task_limit'] = min($tasks, 100);
        }

        return $changes;
    }

    /**
     * The same limit the panel gives (AppServiceProvider::apiLimit): per user, or per address
     * without one, over the panel's period, with Prism Tweaks' number.
     *
     * @param  array<string, mixed>  $settings
     * @param  array<int, array<string, ?int>>  $users
     */
    private static function apiLimit(Request $request, string $api, array $settings, array $users): Limit
    {
        $user = $request->user();
        $signedIn = $user instanceof User;
        $perMinute = Limits::apiPerMinute($settings, $users, $api, $signedIn ? (int) $user->id : null, $signedIn && (bool) $user->root_admin, config()->integer("http.rate_limit.{$api}"));

        if ($perMinute === null) {
            return Limit::none();
        }

        return Limit::perMinutes(config()->integer("http.rate_limit.{$api}_period"), $perMinute)->by($signedIn ? $user->uuid : $request->ip());
    }

    /**
     * The panel's per-server limit (ResourceLimit::boot), with the number from the server's
     * admin page or Prism Properties. The panel's period is kept.
     *
     * @param  array<string, mixed>  $settings
     */
    private static function resourceLimit(Request $request, ResourceLimit $case, array $settings): Limit
    {
        $route = $request->route();
        throw_if($route === null, InvalidArgumentException::class, 'Expected an active route when applying a server resource limit.');

        $server = $route->parameter('server');
        throw_unless($server instanceof Server, InvalidArgumentException::class, 'Expected route parameter [server] to be a server.');

        $limit = $case->limit();
        try {
            $own = (new ExtensionSettings(self::EXTENSION))->fields($server)->all();
        } catch (Throwable) {
            $own = [];
        }
        $number = Limits::resource($settings, $own, $case->name);
        if ($number !== null) {
            $limit->maxAttempts = $number;
        }

        return $limit->by($server->uuid);
    }
}
