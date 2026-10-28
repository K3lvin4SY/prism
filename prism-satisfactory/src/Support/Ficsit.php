<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * ficsit.app, the Satisfactory Mod Repository that the Satisfactory Mod Manager uses. Mods are
 * named by their mod reference, such as "RefinedPower"; each version has builds per platform,
 * and a server needs the LinuxServer one. A version names the game builds it works with as a
 * changelist condition (">=491125") and the mods it needs with a semver condition ("^3.11.0").
 * Every mod needs the Satisfactory Mod Loader, SML.
 *
 * A mod in the browser:
 *  id, name      the mod reference
 *  title, summary, author, icon, url
 *  downloads, updated (unix seconds of the newest version)
 *  tags
 *  version       the newest version this server can run, if any
 */
final class Ficsit
{
    private const string API = 'https://api.ficsit.app/v2/query';

    public const array SORTS = ['popular' => 'popularity', 'downloads' => 'downloads', 'trending' => 'hotness', 'updated' => 'last_version_date', 'name' => 'name'];

    private const string VERSION_FIELDS = 'id version game_version created_at targets { targetName hash size link } dependencies { mod_id condition optional }';

    private const string MOD_FIELDS = 'id mod_reference name short_description logo downloads last_version_date tags { name } authors { role user { username } }';

    /**
     * @param  array{query?: string|null, sort?: string|null, page?: int, limit?: int}  $params
     * @return array{total: int, hits: list<array<string, mixed>>}
     */
    public static function search(array $params, ?int $changelist): array
    {
        $limit = max(1, min(50, (int) ($params['limit'] ?? 20)));
        $page = max(1, (int) ($params['page'] ?? 1));
        $filter = ['limit' => $limit, 'offset' => ($page - 1) * $limit, 'order_by' => self::SORTS[$params['sort'] ?? 'popular'] ?? 'popularity', 'order' => ($params['sort'] ?? '') === 'name' ? 'asc' : 'desc', 'hidden' => false];
        $query = trim((string) ($params['query'] ?? ''));
        // The repository needs at least three letters to search.
        if (mb_strlen($query) >= 3) {
            $filter['search'] = $query;
        }

        $data = self::query('query ($filter: ModFilter) { getMods(filter: $filter) { count mods { '.self::MOD_FIELDS.' versions(filter: { limit: 15, order_by: created_at, order: desc }) { '.self::VERSION_FIELDS.' } } } }', ['filter' => $filter]);

        return [
            'total' => (int) ($data['getMods']['count'] ?? 0),
            'hits' => array_map(static fn (array $mod): array => self::present($mod, $changelist), $data['getMods']['mods'] ?? []),
        ];
    }

    /**
     * Full details of mods by reference, with the version to install on this server.
     *
     * @param  list<string>  $references
     * @return array<string, array<string, mixed>> keyed by reference; unknown mods are left out
     */
    public static function details(array $references, ?int $changelist): array
    {
        $result = [];
        foreach (array_unique($references) as $reference) {
            $mod = Cache::remember('ext:prism-satisfactory:mod:'.$reference, 600, static function () use ($reference): ?array {
                $data = self::query('query ($reference: ModReference!) { getModByReference(modReference: $reference) { '.self::MOD_FIELDS.' full_description versions(filter: { limit: 40, order_by: created_at, order: desc }) { '.self::VERSION_FIELDS.' } } }', ['reference' => $reference]);

                return is_array($data['getModByReference'] ?? null) ? $data['getModByReference'] : null;
            });
            if ($mod !== null) {
                $result[$reference] = self::present($mod, $changelist, true);
            }
        }

        return $result;
    }

    /**
     * The mods and every mod they need, dependencies first, each at the newest version that
     * runs on this server.
     *
     * @param  list<string>  $references
     * @return array<string, array<string, mixed>>
     */
    public static function withDependencies(array $references, ?int $changelist): array
    {
        $all = [];
        $next = $references;
        for ($depth = 0; $depth < 6 && $next !== []; $depth++) {
            $found = self::details($next, $changelist);
            $all = $found + $all;
            $next = [];
            foreach ($found as $mod) {
                foreach ($mod['release']['dependencies'] ?? [] as $dependency) {
                    if (! $dependency['optional'] && ! isset($all[$dependency['id']])) {
                        $next[] = $dependency['id'];
                    }
                }
            }
        }

        $ordered = [];
        $visiting = [];
        $visit = function (string $reference) use (&$visit, &$ordered, &$visiting, $all): void {
            if (isset($ordered[$reference]) || isset($visiting[$reference]) || ! isset($all[$reference])) {
                return;
            }
            $visiting[$reference] = true;
            foreach ($all[$reference]['release']['dependencies'] ?? [] as $dependency) {
                $visit($dependency['id']);
            }
            $ordered[$reference] = $all[$reference];
        };
        foreach (array_keys($all) as $reference) {
            $visit((string) $reference);
        }

        return $ordered;
    }

    /**
     * Whether a version condition holds: ">=491125" against a game changelist, or "^3.11.0"
     * against a mod version. Several conditions with spaces must all hold; "||" gives choices.
     * A condition it cannot read is taken as met.
     */
    public static function satisfies(string $condition, string $version): bool
    {
        $condition = trim($condition);
        if ($condition === '' || $condition === '*') {
            return true;
        }

        foreach (preg_split('/\s*\|\|\s*/', $condition) ?: [] as $alternative) {
            $met = true;
            foreach (preg_split('/\s+/', trim($alternative)) ?: [] as $part) {
                if (! preg_match('/^(\^|~|>=|<=|>|<|=)?v?(\d+(?:\.\d+){0,2})/', $part, $match)) {
                    continue;
                }
                [$operator, $target] = [$match[1], $match[2]];
                $met = $met && match ($operator) {
                    '>=' => version_compare($version, $target, '>='),
                    '>' => version_compare($version, $target, '>'),
                    '<=' => version_compare($version, $target, '<='),
                    '<' => version_compare($version, $target, '<'),
                    '^' => version_compare($version, $target, '>=') && version_compare($version, self::caretLimit($target), '<'),
                    '~' => version_compare($version, $target, '>=') && version_compare($version, self::tildeLimit($target), '<'),
                    // A bare version is that version, as in npm; a bare changelist is that build or newer.
                    default => str_contains($target, '.') ? version_compare($version, $target, '==') : version_compare($version, $target, '>='),
                };
            }
            if ($met) {
                return true;
            }
        }

        return false;
    }

    /** ^1.2.3 allows up to 2.0.0; ^0.2.3 up to 0.3.0. */
    private static function caretLimit(string $version): string
    {
        $parts = array_map('intval', explode('.', $version)) + [0, 0, 0];

        return $parts[0] > 0 ? ($parts[0] + 1).'.0.0' : '0.'.($parts[1] + 1).'.0';
    }

    /** ~1.2.3 allows up to 1.3.0. */
    private static function tildeLimit(string $version): string
    {
        $parts = array_map('intval', explode('.', $version)) + [0, 0, 0];

        return $parts[0].'.'.($parts[1] + 1).'.0';
    }

    /**
     * The newest version with a Linux server build that runs on this game build.
     *
     * @param  list<array<string, mixed>>  $versions  newest first
     * @return array<string, mixed>|null
     */
    public static function pick(array $versions, ?int $changelist): ?array
    {
        foreach ($versions as $version) {
            $target = self::linuxServer($version);
            if ($target === null) {
                continue;
            }
            if ($changelist !== null && ! self::satisfies((string) ($version['game_version'] ?? ''), (string) $changelist)) {
                continue;
            }

            return [
                'id' => (string) $version['id'],
                'version' => (string) $version['version'],
                'gameVersion' => (string) ($version['game_version'] ?? ''),
                'url' => 'https://api.ficsit.app'.$target['link'],
                'size' => (int) $target['size'],
                'sha256' => strtolower((string) $target['hash']),
                'dependencies' => array_values(array_map(static fn (array $dependency): array => [
                    'id' => (string) $dependency['mod_id'],
                    'condition' => (string) ($dependency['condition'] ?? ''),
                    'optional' => (bool) ($dependency['optional'] ?? false),
                ], array_filter($version['dependencies'] ?? [], 'is_array'))),
            ];
        }

        return null;
    }

    /** @param  array<string, mixed>  $version */
    private static function linuxServer(array $version): ?array
    {
        foreach ($version['targets'] ?? [] as $target) {
            if (is_array($target) && ($target['targetName'] ?? null) === 'LinuxServer' && is_string($target['link'] ?? null)) {
                return $target;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $mod
     * @return array<string, mixed>
     */
    private static function present(array $mod, ?int $changelist, bool $full = false): array
    {
        $versions = array_values(array_filter($mod['versions'] ?? [], 'is_array'));
        $release = self::pick($versions, $changelist);
        $authors = array_map(static fn (array $author): string => (string) ($author['user']['username'] ?? ''), array_filter($mod['authors'] ?? [], 'is_array'));

        $result = [
            'id' => (string) $mod['mod_reference'],
            'name' => (string) $mod['mod_reference'],
            'title' => (string) ($mod['name'] ?? $mod['mod_reference']),
            'summary' => (string) ($mod['short_description'] ?? ''),
            'author' => $authors[0] ?? null,
            'icon' => is_string($mod['logo'] ?? null) && $mod['logo'] !== '' ? $mod['logo'] : null,
            'url' => 'https://ficsit.app/mod/'.rawurlencode((string) $mod['mod_reference']),
            'downloads' => (int) ($mod['downloads'] ?? 0),
            'updated' => strtotime((string) ($mod['last_version_date'] ?? '')) ?: 0,
            'tags' => array_values(array_filter(array_map(static fn (array $tag): string => trim((string) ($tag['name'] ?? '')), array_filter($mod['tags'] ?? [], 'is_array')))),
            'version' => $release['version'] ?? null,
            // A Linux server build exists at all, for this game build or another.
            'linux' => array_filter($versions, static fn (array $version): bool => self::linuxServer($version) !== null) !== [],
            'release' => $release,
        ];
        if ($full) {
            $result['body'] = mb_substr((string) ($mod['full_description'] ?? ''), 0, 20_000);
            $result['latest'] = isset($versions[0]['version']) ? (string) $versions[0]['version'] : null;
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $variables
     * @return array<string, mixed>
     */
    private static function query(string $query, array $variables): array
    {
        try {
            $response = Http::withUserAgent(Settings::USER_AGENT)->acceptJson()->timeout(20)->post(self::API, ['query' => $query, 'variables' => (object) $variables]);
        } catch (Throwable $exception) {
            throw new RuntimeException('ficsit.app could not be reached: '.$exception->getMessage());
        }
        if (! $response->successful()) {
            throw new RuntimeException('ficsit.app answered '.$response->status().'.');
        }
        $errors = $response->json('errors');
        if (is_array($errors) && $errors !== [] && $response->json('data') === null) {
            throw new RuntimeException('ficsit.app: '.($errors[0]['message'] ?? 'the query failed.'));
        }

        return (array) $response->json('data');
    }
}
