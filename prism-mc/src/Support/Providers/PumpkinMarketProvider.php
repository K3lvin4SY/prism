<?php

declare(strict_types=1);

namespace PrismMc\Support\Providers;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismMc\Support\McJars;
use PrismMc\Support\Settings;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Native Pumpkin plugins (.wasm) from the Pumpkin Market, shaped like Modrinth's projects so
 * the plugin browser shows both the same way.
 *
 * The Market lists about a hundred and fifty plugins, so the whole free catalogue is fetched
 * once and searched, filtered and sorted here. A listing has one current file and no version
 * history, so each project has a single version. Project ids carry a prefix so they never
 * collide with Modrinth's.
 */
final class PumpkinMarketProvider implements ContentProvider
{
    public const string ID = 'pumpkin-market';

    public const string PREFIX = 'market-';

    public const string LOADER = 'pumpkin';

    private const string BASE = 'https://market.pumpkinmc.org';

    /** Market categories and the Modrinth category each is filed under in the browser. */
    public const array CATEGORIES = [
        'Admin Tools' => 'management',
        'Economy' => 'economy',
        'Fun' => 'minigame',
        'World Management' => 'worldgen',
        'Utilities' => 'utility',
        'Chat' => 'social',
        'Other' => null,
    ];

    /** A pumpkin, drawn for the loader filter like Modrinth's loader icons. */
    private const string ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-1.5-2-1-3.5.5-4"/><path d="M12 6c-3.5-1.5-8 .5-8 6.5S7.5 21 12 21s8-2.5 8-8.5S15.5 4.5 12 6Z"/><path d="M9 7.5C7.5 10 7.5 16 9.5 20"/><path d="M15 7.5c1.5 2.5 1.5 8.5-.5 12.5"/></svg>';

    public function id(): string
    {
        return self::ID;
    }

    public static function owns(?string $id): bool
    {
        return is_string($id) && str_starts_with($id, self::PREFIX);
    }

    /** @return array{name: string, icon: string} the loader entry for the filter sidebar */
    public static function loader(): array
    {
        return ['name' => self::LOADER, 'icon' => self::ICON];
    }

    public function search(array $search): array
    {
        $hits = $this->filter($search);
        $page = array_slice($hits, max(0, (int) ($search['offset'] ?? 0)), max(1, (int) ($search['limit'] ?? 20)));
        $details = $this->details(array_column($page, 'public_id'));

        return [
            'hits' => array_map(fn (array $plugin): array => $this->hit($plugin, $details[$plugin['public_id']] ?? null), $page),
            'total' => count($hits),
        ];
    }

    /**
     * @param  array<string, mixed>  $search
     * @return list<array<string, mixed>> matching listings, sorted
     */
    private function filter(array $search): array
    {
        $query = mb_strtolower(trim((string) ($search['query'] ?? '')));
        $include = $search['categories'] ?? [];
        $exclude = $search['excludeCategories'] ?? [];

        // Drafts and taken-down listings stay in the Market's search but cannot be downloaded.
        $details = $this->details(array_column($this->catalogue(), 'public_id'));
        $hits = array_values(array_filter($this->catalogue(), static function (array $plugin) use ($query, $include, $exclude, $details): bool {
            if (($details[$plugin['public_id']]['unavailable'] ?? false) === true) {
                return false;
            }

            $category = self::CATEGORIES[$plugin['category'] ?? ''] ?? null;
            if ($include !== [] && ! in_array($category, $include, true)) {
                return false;
            }

            if ($category !== null && in_array($category, $exclude, true)) {
                return false;
            }

            return $query === '' || str_contains(mb_strtolower($plugin['name'].' '.$plugin['dev_name']), $query);
        }));

        $sort = $search['sort'] ?? 'relevance';
        usort($hits, static function (array $a, array $b) use ($sort, $query): int {
            return match ($sort) {
                'downloads', 'follows' => $b['downloads'] <=> $a['downloads'],
                'newest' => strcmp((string) $b['created_at'], (string) $a['created_at']),
                'updated' => strcmp((string) $b['updated_at'], (string) $a['updated_at']),
                // Relevance: names that start with the search first, then the most downloaded.
                default => [$query !== '' && ! str_starts_with(mb_strtolower($a['name']), $query), $b['downloads']]
                    <=> [$query !== '' && ! str_starts_with(mb_strtolower($b['name']), $query), $a['downloads']],
            };
        });

        return $hits;
    }

    public function categories(string $type): array
    {
        return [];
    }

    public function loaders(string $type): array
    {
        return $type === 'plugin' ? [self::loader()] : [];
    }

    public function gameVersions(): array
    {
        return [];
    }

    public function project(string $id): array
    {
        $plugin = $this->find($id);
        $detail = $this->details([$plugin['public_id']])[$plugin['public_id']] ?? null;
        $hit = $this->hit($plugin, $detail);

        return [
            ...$hit,
            'body' => mb_substr($this->description($detail), 0, 20_000),
            'follows' => 0,
            'gameVersions' => [],
            'serverSide' => 'required',
            'clientSide' => 'unsupported',
            'license' => null,
            'source' => is_string($detail['source_link'] ?? null) && str_starts_with($detail['source_link'], 'https://') ? $detail['source_link'] : null,
            'issues' => null,
            'type' => 'plugin',
        ];
    }

    public function versions(string $projectId, array $loaders = [], array $gameVersions = []): array
    {
        if ($loaders !== [] && ! in_array(self::LOADER, $loaders, true)) {
            return [];
        }

        return [$this->versionOf($this->findAvailable($projectId))];
    }

    public function version(string $id): array
    {
        // A version id is its project's id: the Market only offers the current file.
        return $this->versionOf($this->findAvailable($id));
    }

    public function latestForHashes(array $sha1s, array $loaders, array $gameVersions): array
    {
        return [];
    }

    public function versionsForHashes(array $sha1s): array
    {
        return [];
    }

    public function projects(array $ids): array
    {
        $projects = [];
        foreach ($ids as $id) {
            try {
                $plugin = $this->find($id);
                $projects[$id] = ['id' => $id, 'slug' => $plugin['public_id'], 'title' => $plugin['name'], 'icon' => $plugin['preview_url'], 'url' => $this->url($plugin)];
            } catch (HttpException) {
                // A listing that went away has no name or icon to show.
            }
        }

        return $projects;
    }

    /** The current version of a listing, for update checks of installed files. */
    public function currentVersion(string $id): ?string
    {
        try {
            return $this->find($id)['version'] ?: null;
        } catch (HttpException) {
            return null;
        }
    }

    /**
     * The free listings, newest first. Paid listings need a purchase on the Market and are
     * left out.
     *
     * @return list<array<string, mixed>>
     */
    public function catalogue(): array
    {
        return Cache::remember('ext:prism-mc:market:catalogue', 600, function (): array {
            $plugins = [];
            for ($page = 1; $page <= 20; $page++) {
                $batch = $this->get('/api/v1/rest/plugins', ['type' => 'free', 'limit' => 100, 'page' => $page]);
                foreach ($batch as $plugin) {
                    if (is_array($plugin) && is_string($plugin['public_id'] ?? null) && ($plugin['type'] ?? 'free') === 'free') {
                        $plugins[$plugin['public_id']] = [
                            'id' => (int) ($plugin['id'] ?? 0),
                            'public_id' => $plugin['public_id'],
                            'name' => (string) ($plugin['name'] ?? $plugin['public_id']),
                            'version' => (string) ($plugin['version'] ?? ''),
                            'category' => (string) ($plugin['category'] ?? 'Other'),
                            'downloads' => (int) ($plugin['downloads'] ?? 0),
                            'dev_name' => (string) ($plugin['dev_name'] ?? ''),
                            'preview_url' => is_string($plugin['preview_url'] ?? null) && str_starts_with($plugin['preview_url'], 'https://') ? $plugin['preview_url'] : null,
                            'created_at' => $plugin['created_at'] ?? null,
                            'updated_at' => $plugin['updated_at'] ?? null,
                        ];
                    }
                }

                if (count($batch) < 100) {
                    break;
                }
            }

            return array_values($plugins);
        });
    }

    /** @return array<string, mixed> */
    private function find(string $id): array
    {
        $publicId = self::owns($id) ? substr($id, strlen(self::PREFIX)) : $id;
        foreach ($this->catalogue() as $plugin) {
            if ($plugin['public_id'] === $publicId) {
                return $plugin;
            }
        }

        abort(404, 'This plugin is not on the Pumpkin Market, or is not free.');
    }

    /** @return array<string, mixed> a listing that can be downloaded */
    private function findAvailable(string $id): array
    {
        $plugin = $this->find($id);
        abort_if(($this->details([$plugin['public_id']])[$plugin['public_id']]['unavailable'] ?? false) === true, 422, 'This plugin is a draft or offline on the Pumpkin Market.');

        return $plugin;
    }

    /**
     * Full listings with their descriptions, fetched side by side and cached.
     *
     * @param  list<string>  $publicIds
     * @return array<string, array<string, mixed>>
     */
    private function details(array $publicIds): array
    {
        $details = [];
        $missing = [];
        foreach ($publicIds as $publicId) {
            $cached = Cache::get("ext:prism-mc:market:plugin:$publicId");
            is_array($cached) ? $details[$publicId] = $cached : $missing[] = $publicId;
        }

        // A few at a time, so a cold cache does not flood the Market.
        foreach (array_chunk($missing, 25) as $batch) {
            $responses = Http::pool(fn (Pool $pool) => array_map(
                fn (string $publicId) => $this->authorize($pool->as($publicId)->withUserAgent(McJars::USER_AGENT))->acceptJson()->timeout(10)->get(self::BASE.'/api/plugins/'.rawurlencode($publicId)),
                $batch,
            ));

            foreach ($batch as $publicId) {
                $response = $responses[$publicId] ?? null;
                if (! $response instanceof Response) {
                    continue;
                }

                $data = $response->successful() ? $response->json() : null;
                if (is_array($data) && ($data['status'] ?? 'published') === 'published') {
                    $details[$publicId] = $data;
                } elseif ($response->status() === 404 || is_array($data)) {
                    // Drafts and unpublished listings answer 404 here and 403 to downloads.
                    $details[$publicId] = ['unavailable' => true];
                } else {
                    continue;
                }

                Cache::put("ext:prism-mc:market:plugin:$publicId", $details[$publicId], 3600);
            }
        }

        return $details;
    }

    /**
     * @param  array<string, mixed>  $plugin
     * @param  array<string, mixed>|null  $detail
     * @return array<string, mixed>
     */
    private function hit(array $plugin, ?array $detail): array
    {
        $category = self::CATEGORIES[$plugin['category']] ?? null;
        $description = $this->description($detail);

        return [
            'id' => self::PREFIX.$plugin['public_id'],
            'slug' => $plugin['public_id'],
            'title' => $plugin['name'],
            'description' => self::summary($description),
            'author' => $plugin['dev_name'] !== '' ? $plugin['dev_name'] : null,
            'icon' => $plugin['preview_url'],
            'gallery' => null,
            'color' => null,
            'downloads' => $plugin['downloads'],
            'follows' => 0,
            'updated' => $plugin['updated_at'],
            'categories' => $category !== null ? [$category] : [],
            'loaders' => [self::LOADER],
            'clientSide' => 'unsupported',
            'gameVersions' => [],
            'serverSide' => 'required',
            'url' => $this->url($plugin),
            'source' => self::ID,
        ];
    }

    /**
     * @param  array<string, mixed>  $plugin
     * @return array<string, mixed>
     */
    private function versionOf(array $plugin): array
    {
        $filename = (string) preg_replace('/[^A-Za-z0-9._-]+/', '_', $plugin['name']).'.wasm';

        return [
            'id' => self::PREFIX.$plugin['public_id'],
            'projectId' => self::PREFIX.$plugin['public_id'],
            'name' => $plugin['name'].' '.$plugin['version'],
            'number' => $plugin['version'] !== '' ? $plugin['version'] : 'latest',
            'type' => 'release',
            'loaders' => [self::LOADER],
            'gameVersions' => [],
            'published' => $plugin['updated_at'],
            'downloads' => $plugin['downloads'],
            'changelog' => '',
            'files' => [[
                'url' => self::BASE.'/api/v1/rest/plugins/'.rawurlencode($plugin['public_id']).'/download',
                'filename' => $filename,
                // Each download is signed for its buyer, so the size and hash are not fixed.
                'size' => null,
                'sha1' => null,
                'sha512' => null,
                'primary' => true,
            ]],
            'dependencies' => [],
        ];
    }

    /** @param array<string, mixed> $plugin */
    private function url(array $plugin): string
    {
        return self::BASE.'/plugin/'.rawurlencode($plugin['public_id']);
    }

    /** The first line of prose in a Markdown description, as Modrinth's summaries are one line. */
    private static function summary(string $markdown): string
    {
        foreach (preg_split('/\r?\n/', $markdown) as $line) {
            $line = trim($line);
            // Headings, images, rules, HTML and badges are not prose.
            if ($line === '' || preg_match('/^(#|!\[|---|\*\*\*|<|\[!\[)/', $line)) {
                continue;
            }

            $line = (string) preg_replace(['/\[([^\]]*)\]\([^)]*\)/', '/[*_`>]+/', '/^[-+]\s+/'], ['$1', '', ''], $line);

            return mb_substr(trim($line), 0, 200);
        }

        return '';
    }

    /** @param array<string, mixed>|null $detail */
    private function description(?array $detail): string
    {
        $descriptions = $detail['translated_descriptions'] ?? $detail['description'] ?? '';
        if (is_array($descriptions)) {
            $descriptions = $descriptions['en-US'] ?? $descriptions['en'] ?? (reset($descriptions) ?: '');
        }

        return is_string($descriptions) ? trim($descriptions) : '';
    }

    /** @return array<mixed> */
    private function get(string $path, array $query): array
    {
        $response = $this->authorize(Http::withUserAgent(McJars::USER_AGENT))->acceptJson()->timeout(15)->get(self::BASE.$path, $query);
        throw_unless($response->successful() && is_array($response->json()), RuntimeException::class, 'The Pumpkin Market did not answer: '.$response->status());

        return $response->json();
    }

    /** Adds the Market API key from the extension settings, when one is set. */
    private function authorize(PendingRequest $request): PendingRequest
    {
        $key = Settings::admin('pumpkin_market_key');

        return is_string($key) && $key !== '' ? $request->withToken($key) : $request;
    }
}
