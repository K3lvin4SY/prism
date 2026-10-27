<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Core Keeper's server builds: the public branch, and the legacy builds Pugstorm keeps as
 * public Steam branches without a password. Read from Steam's app info through
 * api.steamcmd.net; the list below stands in when that is down.
 */
final class Branches
{
    /** @var list<array{id: string, build: string|null, updated: int|null, description: string|null}> */
    private const array FALLBACK = [
        ['id' => 'public', 'build' => null, 'updated' => null, 'description' => null],
        ['id' => '1.2.1.5', 'build' => '23543502', 'updated' => 1780908336, 'description' => 'Legacy build - 1.2.1.5'],
        ['id' => '1.2.0.7', 'build' => '22516523', 'updated' => 1775041400, 'description' => 'Legacy build - 1.2.0.7'],
        ['id' => '1.1.2.10', 'build' => '21036907', 'updated' => 1772012964, 'description' => 'Legacy build - 1.1.2.10'],
        ['id' => '1.1.2.0', 'build' => '21055749', 'updated' => 1764862585, 'description' => 'Legacy build - 1.1.2.0 with security patch'],
    ];

    /** @return list<array{id: string, build: string|null, updated: int|null, description: string|null}> public first, then newest legacy builds */
    public static function all(): array
    {
        return Cache::remember('ext:prism-corekeeper:branches', 3600, static function (): array {
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

            usort($list, static fn (array $a, array $b): int => $a['id'] === 'public' ? -1 : ($b['id'] === 'public' ? 1 : version_compare($b['id'], $a['id'])));

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
