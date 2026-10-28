<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Works out whether a server runs Satisfactory's dedicated server, and which build: the egg has
 * a Satisfactory tag, installs Steam app 1690800, or starts FactoryGame. The answer decides which
 * tabs a server gets, so it is cached for a few minutes.
 */
final class Detector
{
    public const array FEATURES = ['players', 'properties', 'versions', 'mods'];

    public const string LOG = 'FactoryGame/Saved/Logs/FactoryGame.log';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function forget(Server $server): void
    {
        Cache::forget(self::cacheKey($server));
    }

    /** @return array<string, mixed> */
    public function info(bool $fresh = false): array
    {
        if ($fresh) {
            self::forget($this->server);
        }

        return Cache::remember(self::cacheKey($this->server), 300, fn (): array => $this->detect());
    }

    private static function cacheKey(Server $server): string
    {
        // The detected tags are part of the key, so changing them applies at once.
        return 'ext:prism-satisfactory:info:'.$server->uuid.':'.md5(implode(',', Settings::eggTags()));
    }

    public function isSatisfactory(): bool
    {
        $egg = $this->server->egg;
        if ($egg === null) {
            return false;
        }

        $detected = Settings::eggTags();
        if ($egg->tags->contains(static fn ($tag): bool => in_array(strtolower((string) $tag->name), $detected, true) || in_array(strtolower((string) $tag->slug), $detected, true))) {
            return true;
        }

        return $this->variable('SRCDS_APPID') === (string) Settings::SERVER_APP
            || str_contains((string) $this->server->startup, 'FactoryGame')
            || str_contains((string) $egg->startup, 'FactoryGame');
    }

    /** @return array<string, mixed> */
    private function detect(): array
    {
        if (! $this->isSatisfactory()) {
            return ['satisfactory' => false, 'build' => null, 'branch' => null, 'changelist' => null, 'features' => array_fill_keys(self::FEATURES, false)];
        }

        $installed = $this->installed();

        return [
            'satisfactory' => true,
            // Steam's build id and branch, from the app manifest SteamCMD writes.
            'build' => $installed['build'],
            'branch' => $installed['branch'],
            // The game's changelist, such as 513885: what mods name as the game version they need.
            'changelist' => $this->changelist(),
            'features' => array_fill_keys(self::FEATURES, true),
        ];
    }

    /** @return array{build: string|null, branch: string} */
    public function installed(): array
    {
        try {
            $acf = ServerFiles::for($this->server)->read('steamapps/appmanifest_'.Settings::SERVER_APP.'.acf', 200_000) ?? '';
        } catch (Throwable) {
            $acf = '';
        }

        $build = preg_match('/"buildid"\s+"(\d+)"/', $acf, $match) ? $match[1] : null;
        // SteamCMD writes the chosen branch as BetaKey under UserConfig; none means public.
        $branch = preg_match('/"BetaKey"\s+"([^"]*)"/i', $acf, $match) && $match[1] !== '' ? $match[1] : 'public';

        return ['build' => $build, 'branch' => $branch];
    }

    /** "LogInit: Build: ++FactoryGame+rel-main-1.1-CL-513885" near the top of the log. */
    private function changelist(): ?int
    {
        try {
            $log = ServerFiles::for($this->server)->read(self::LOG, 8_000_000) ?? '';
        } catch (Throwable) {
            return null;
        }

        return preg_match('/^LogInit: Build: \S*-CL-(\d+)/m', $log, $match) ? (int) $match[1] : null;
    }

    /** A startup variable's value on this server, or null when the egg has no such variable. */
    public function variable(string $name): ?string
    {
        foreach ($this->server->variables as $variable) {
            if ($variable->env_variable === $name) {
                $value = $variable->server_value ?? $variable->default_value;

                return is_string($value) && $value !== '' ? $value : null;
            }
        }

        return null;
    }
}
