<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Satisfactory's server builds: the public branch and the experimental one, the Steam branches
 * without a password. Read from Steam's app info through api.steamcmd.net; the list below
 * stands in when that is down.
 */
final class Branches
{
    /** @var list<array{id: string, build: string|null, updated: int|null, description: string|null}> */
    private const array FALLBACK = [
        ['id' => 'public', 'build' => null, 'updated' => null, 'description' => null],
        ['id' => 'experimental', 'build' => null, 'updated' => null, 'description' => null],
    ];

    /** @return list<array{id: string, build: string|null, updated: int|null, description: string|null}> public first */
    public static function all(): array
    {
        return Cache::remember('ext:prism-satisfactory:branches', 3600, static function (): array {
            try {
                $branches = Http::withUserAgent(Settings::USER_AGENT)->timeout(10)->get('https://api.steamcmd.net/v1/info/'.Settings::SERVER_APP)
                    ->json('data.'.Settings::SERVER_APP.'.depots.branches');
            } catch (Throwable) {
                $branches = null;
            }

            if (! is_array($branches) || ! isset($branches['public'])) {
                return self::FALLBACK;
            }

            $list = [];
            foreach ($branches as $id => $branch) {
                // Password-protected branches (tests) cannot be installed anonymously.
                if (! is_array($branch) || ! empty($branch['pwdrequired']) || ! preg_match('/^[A-Za-z0-9._-]{1,40}$/', (string) $id)) {
                    continue;
                }
                $list[] = [
                    'id' => (string) $id,
                    'build' => isset($branch['buildid']) ? (string) $branch['buildid'] : null,
                    'updated' => isset($branch['timeupdated']) ? (int) $branch['timeupdated'] : null,
                    'description' => isset($branch['description']) ? (string) $branch['description'] : null,
                ];
            }

            usort($list, static fn (array $a, array $b): int => $a['id'] === 'public' ? -1 : ($b['id'] === 'public' ? 1 : strcmp($a['id'], $b['id'])));

            return $list;
        });
    }

    public static function find(string $id): ?array
    {
        foreach (self::all() as $branch) {
            if ($branch['id'] === $id) {
                return $branch;
            }
        }

        return null;
    }
}
