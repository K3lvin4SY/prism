<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use RuntimeException;
use Throwable;

/**
 * The Factorio mod portal (mods.factorio.com). Its API has no text search, so the whole list
 * for a game version (about 10,000 mods, a few MB) is fetched once an hour and searched here.
 * Mods are named by their portal name, such as "even-distribution".
 *
 * A mod in the browser:
 *  id, name      the portal name
 *  title, summary, author, icon, url
 *  downloads, score
 *  category
 *  updated       unix seconds of the newest release
 *  version       the newest release for the server's game version
 *  factorioVersion  the game version that release is for, such as 2.1
 */
final class ModPortal
{
    private const string API = 'https://mods.factorio.com/api/mods';

    public const array CATEGORIES = [
        'content' => 'Content',
        'overhaul' => 'Overhaul',
        'tweaks' => 'Tweaks',
        'utilities' => 'Utilities',
        'scenarios' => 'Scenarios',
        'mod-packs' => 'Mod packs',
        'localizations' => 'Translations',
        'internal' => 'Libraries',
        'no-category' => 'Other',
    ];

    public const array SORTS = ['popular', 'downloads', 'rating', 'updated', 'name'];

    /**
     * The username and token the portal needs for downloads: the server's own from its
     * server-settings.json, then its SERVER_USERNAME and SERVER_TOKEN variables, then the admin's.
     *
     * @return array{username: string, token: string, from: string}|null
     */
    public static function credentials(Server $server): ?array
    {
        try {
            $settings = ServerFiles::for($server)->readJson('data/server-settings.json');
        } catch (Throwable) {
            $settings = null;
        }
        $detector = Detector::for($server);
        $candidates = [
            'server' => [(string) ($settings['username'] ?? ''), (string) ($settings['token'] ?? '')],
            'variables' => [(string) $detector->variable('SERVER_USERNAME'), (string) $detector->variable('SERVER_TOKEN')],
            'admin' => [Settings::string('factorio_username'), Settings::string('factorio_token')],
        ];

        foreach ($candidates as $from => [$username, $token]) {
            // The egg's defaults are "unnamed" and "undefined".
            if ($username !== '' && $username !== 'unnamed' && $token !== '' && $token !== 'undefined') {
                return ['username' => $username, 'token' => $token, 'from' => $from];
            }
        }

        return null;
    }

    /** A download link with the account added; the portal answers it with a redirect to the file. */
    public static function withCredentials(string $url, Server $server): string
    {
        $credentials = self::credentials($server) ?? throw new RuntimeException('Add a factorio.com username and token in Properties, or ask an administrator to add one in Prism Properties, to download mods.');

        return $url.(str_contains($url, '?') ? '&' : '?').http_build_query(['username' => $credentials['username'], 'token' => $credentials['token']]);
    }

    /**
     * Every mod with a release for the game version, trimmed to what the browser needs.
     *
     * @return list<array<string, mixed>>
     */
    public static function all(string $major): array
    {
        return Cache::remember('ext:prism-factorio:portal:'.$major, 3600, static function () use ($major): array {
            $response = self::get(self::API, ['page_size' => 'max', 'version' => $major, 'hide_deprecated' => 'true'], 60);

            $mods = [];
            foreach ($response['results'] ?? [] as $mod) {
                $release = $mod['latest_release'] ?? null;
                if (! is_array($release) || ! isset($mod['name'])) {
                    continue;
                }
                $mods[] = [
                    'name' => (string) $mod['name'],
                    'title' => (string) ($mod['title'] ?? $mod['name']),
                    'owner' => (string) ($mod['owner'] ?? ''),
                    'summary' => mb_substr((string) ($mod['summary'] ?? ''), 0, 400),
                    'downloads' => (int) ($mod['downloads_count'] ?? 0),
                    'score' => (float) ($mod['score'] ?? 0),
                    'category' => (string) ($mod['category'] ?? 'no-category'),
                    'version' => (string) ($release['version'] ?? ''),
                    'factorioVersion' => (string) ($release['info_json']['factorio_version'] ?? $major),
                    'updated' => strtotime((string) ($release['released_at'] ?? '')) ?: 0,
                ];
            }

            return $mods;
        });
    }

    /**
     * @param  array{query?: string|null, sort?: string|null, categories?: list<string>, page?: int, limit?: int}  $params
     * @return array{total: int, hits: list<array<string, mixed>>}
     */
    public static function search(string $major, array $params): array
    {
        $mods = self::all($major);
        $words = array_filter(preg_split('/\s+/', mb_strtolower(trim((string) ($params['query'] ?? '')))) ?: []);
        $categories = $params['categories'] ?? [];

        $found = array_values(array_filter($mods, static function (array $mod) use ($words, $categories): bool {
            if ($categories !== [] && ! in_array($mod['category'], $categories, true)) {
                return false;
            }
            $haystack = mb_strtolower($mod['title'].' '.$mod['name'].' '.$mod['owner'].' '.$mod['summary']);
            foreach ($words as $word) {
                if (! str_contains($haystack, $word)) {
                    return false;
                }
            }

            return true;
        }));

        $sort = $params['sort'] ?? 'popular';
        $query = implode(' ', $words);
        usort($found, static function (array $a, array $b) use ($sort, $query): int {
            // A title that is the search itself, or starts with it, comes first.
            if ($query !== '') {
                $rank = static fn (array $mod): int => mb_strtolower($mod['title']) === $query || $mod['name'] === $query ? 0 : (str_starts_with(mb_strtolower($mod['title']), $query) ? 1 : 2);
                if ($rank($a) !== $rank($b)) {
                    return $rank($a) <=> $rank($b);
                }
            }

            return match ($sort) {
                'downloads' => $b['downloads'] <=> $a['downloads'],
                'rating' => $b['score'] <=> $a['score'],
                'updated' => $b['updated'] <=> $a['updated'],
                'name' => strcasecmp($a['title'], $b['title']),
                // The portal's score is a trending measure; downloads keep long-time favorites up.
                default => ($b['score'] + log10($b['downloads'] + 1) * 5) <=> ($a['score'] + log10($a['downloads'] + 1) * 5),
            };
        });

        $limit = max(1, min(50, (int) ($params['limit'] ?? 20)));
        $page = max(1, (int) ($params['page'] ?? 1));
        $hits = array_slice($found, ($page - 1) * $limit, $limit);
        $icons = self::thumbnails(array_column($hits, 'name'));

        return [
            'total' => count($found),
            'hits' => array_map(static fn (array $mod): array => self::present($mod, $icons[$mod['name']] ?? null), $hits),
        ];
    }

    /**
     * The mods' thumbnails, which only the single-mod endpoint has. Asked together, and kept a day.
     *
     * @param  list<string>  $names
     * @return array<string, string|null>
     */
    public static function thumbnails(array $names): array
    {
        $result = [];
        $missing = [];
        foreach ($names as $name) {
            $cached = Cache::get('ext:prism-factorio:thumb:'.$name);
            if ($cached !== null) {
                $result[$name] = $cached === '' ? null : $cached;
            } else {
                $missing[] = $name;
            }
        }

        if ($missing !== []) {
            try {
                $responses = Http::pool(static fn (Pool $pool): array => array_map(
                    static fn (string $name) => $pool->as($name)->withUserAgent(Settings::USER_AGENT)->timeout(8)->get(self::API.'/'.rawurlencode($name)),
                    $missing,
                ));
            } catch (Throwable) {
                $responses = [];
            }
            foreach ($missing as $name) {
                $response = $responses[$name] ?? null;
                if (! $response instanceof \Illuminate\Http\Client\Response || ! $response->successful()) {
                    continue;
                }
                $thumbnail = $response->json('thumbnail');
                $url = is_string($thumbnail) && str_starts_with($thumbnail, '/assets/') && ! str_contains($thumbnail, '.no-thumbnail') ? 'https://assets-mod.factorio.com'.$thumbnail : '';
                Cache::put('ext:prism-factorio:thumb:'.$name, $url, 86400);
                $result[$name] = $url === '' ? null : $url;
            }
        }

        return $result;
    }

    /**
     * Full details of mods, with the release to install for the game version: the newest one
     * made for it, with its file, checksum and the mods it needs.
     *
     * @param  list<string>  $names
     * @return array<string, array<string, mixed>> keyed by name; mods without a release for the version are left out
     */
    public static function details(array $names, string $major): array
    {
        $result = [];
        foreach (array_unique($names) as $name) {
            $mod = Cache::remember('ext:prism-factorio:mod:'.$name, 600, static fn (): ?array => self::fetch($name));
            if ($mod === null) {
                continue;
            }

            $release = null;
            foreach (array_reverse($mod['releases']) as $candidate) {
                if ($candidate['factorioVersion'] === $major) {
                    $release = $candidate;
                    break;
                }
            }

            $result[$name] = [
                ...self::present($mod, $mod['icon']),
                'body' => $mod['body'],
                'versions' => array_values(array_unique(array_column($mod['releases'], 'factorioVersion'))),
                'release' => $release,
                'version' => $release['version'] ?? null,
                'factorioVersion' => $release['factorioVersion'] ?? null,
                'dependencies' => $release['dependencies'] ?? [],
                'incompatible' => $release['incompatible'] ?? [],
                'expansion' => in_array('space-age', $release['dependencies'] ?? [], true),
            ];
        }

        return $result;
    }

    /**
     * The mods and every mod they need, a few levels deep, dependencies first. The game's own
     * mods (base and the expansion) are not downloads, so they are left out.
     *
     * @param  list<string>  $names
     * @return array<string, array<string, mixed>>
     */
    public static function withDependencies(array $names, string $major): array
    {
        $all = [];
        $next = $names;
        for ($depth = 0; $depth < 6 && $next !== []; $depth++) {
            $found = self::details($next, $major);
            $all = $found + $all;
            $next = [];
            foreach ($found as $mod) {
                foreach ($mod['dependencies'] as $dependency) {
                    if (! isset($all[$dependency]) && ! in_array($dependency, Detector::BUILT_IN, true)) {
                        $next[] = $dependency;
                    }
                }
            }
        }

        $ordered = [];
        $visiting = [];
        $visit = function (string $name) use (&$visit, &$ordered, &$visiting, $all): void {
            if (isset($ordered[$name]) || isset($visiting[$name]) || ! isset($all[$name])) {
                return;
            }
            $visiting[$name] = true;
            foreach ($all[$name]['dependencies'] as $dependency) {
                $visit($dependency);
            }
            $ordered[$name] = $all[$name];
        };
        foreach (array_keys($all) as $name) {
            $visit($name);
        }

        return $ordered;
    }

    /**
     * A dependency string from info.json: "base >= 2.1", "? optional-mod", "! incompatible",
     * "(?) hidden-optional" or "~ no-load-order". Required ones have no prefix or "~".
     *
     * @return array{name: string, kind: 'required'|'optional'|'incompatible'}|null
     */
    public static function dependency(string $entry): ?array
    {
        if (! preg_match('/^\s*(\(\?\)|\?|!|~)?\s*([^<>=]+?)\s*(?:(?:<=|>=|<|>|=)\s*[\d.]+)?\s*$/', $entry, $match)) {
            return null;
        }

        return [
            'name' => trim($match[2]),
            'kind' => match ($match[1]) {
                '!' => 'incompatible',
                '?', '(?)' => 'optional',
                default => 'required',
            },
        ];
    }

    /** @return array<string, mixed>|null */
    private static function fetch(string $name): ?array
    {
        try {
            $data = self::get(self::API.'/'.rawurlencode($name).'/full', [], 15);
        } catch (RuntimeException $exception) {
            if (str_contains($exception->getMessage(), '404')) {
                return null;
            }

            throw $exception;
        }

        $releases = [];
        foreach ($data['releases'] ?? [] as $release) {
            $required = [];
            $incompatible = [];
            foreach ($release['info_json']['dependencies'] ?? [] as $entry) {
                $dependency = is_string($entry) ? self::dependency($entry) : null;
                if ($dependency === null) {
                    continue;
                }
                if ($dependency['kind'] === 'required') {
                    $required[] = $dependency['name'];
                } elseif ($dependency['kind'] === 'incompatible') {
                    $incompatible[] = $dependency['name'];
                }
            }
            $releases[] = [
                'version' => (string) ($release['version'] ?? ''),
                'factorioVersion' => (string) ($release['info_json']['factorio_version'] ?? ''),
                'file' => (string) ($release['file_name'] ?? ''),
                'url' => 'https://mods.factorio.com'.($release['download_url'] ?? ''),
                'sha1' => (string) ($release['sha1'] ?? ''),
                'released' => strtotime((string) ($release['released_at'] ?? '')) ?: 0,
                'dependencies' => array_values(array_diff($required, ['base'])),
                'incompatible' => $incompatible,
            ];
        }
        $latest = $releases === [] ? null : $releases[count($releases) - 1];
        $thumbnail = $data['thumbnail'] ?? null;

        return [
            'name' => (string) $data['name'],
            'title' => (string) ($data['title'] ?? $data['name']),
            'owner' => (string) ($data['owner'] ?? ''),
            'summary' => (string) ($data['summary'] ?? ''),
            'body' => mb_substr((string) ($data['description'] ?? ''), 0, 20_000),
            'downloads' => (int) ($data['downloads_count'] ?? 0),
            'score' => (float) ($data['score'] ?? 0),
            'category' => (string) ($data['category'] ?? 'no-category'),
            'version' => $latest['version'] ?? '',
            'factorioVersion' => $latest['factorioVersion'] ?? '',
            'updated' => $latest['released'] ?? 0,
            'icon' => is_string($thumbnail) && str_starts_with($thumbnail, '/assets/') && ! str_contains($thumbnail, '.no-thumbnail') ? 'https://assets-mod.factorio.com'.$thumbnail : null,
            'releases' => $releases,
        ];
    }

    /**
     * @param  array<string, mixed>  $mod
     * @return array<string, mixed>
     */
    private static function present(array $mod, ?string $icon): array
    {
        return [
            'id' => $mod['name'],
            'name' => $mod['name'],
            'title' => $mod['title'],
            'summary' => $mod['summary'],
            'author' => $mod['owner'] !== '' ? $mod['owner'] : null,
            'icon' => $icon,
            'url' => 'https://mods.factorio.com/mod/'.rawurlencode($mod['name']),
            'downloads' => $mod['downloads'],
            'score' => $mod['score'],
            'category' => $mod['category'],
            'version' => $mod['version'] !== '' ? $mod['version'] : null,
            'factorioVersion' => $mod['factorioVersion'] !== '' ? $mod['factorioVersion'] : null,
            'updated' => $mod['updated'],
        ];
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private static function get(string $url, array $query, int $timeout): array
    {
        try {
            $response = Http::withUserAgent(Settings::USER_AGENT)->acceptJson()->timeout($timeout)->get($url, $query);
        } catch (Throwable $exception) {
            throw new RuntimeException('The Factorio mod portal could not be reached: '.$exception->getMessage());
        }
        if (! $response->successful()) {
            throw new RuntimeException('The Factorio mod portal answered '.$response->status().'.');
        }

        return (array) $response->json();
    }
}
