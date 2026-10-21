<?php

declare(strict_types=1);

namespace McSuite\Support\Providers;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use McSuite\Support\McJars;
use RuntimeException;

/**
 * Modrinth's API v2. Every request carries an identifying User-Agent, as Modrinth asks,
 * and answers are cached briefly to stay well inside its rate limit.
 */
final class ModrinthProvider implements ContentProvider
{
    private const string BASE = 'https://api.modrinth.com/v2';

    private const array SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];

    private const string ID = '/^[A-Za-z0-9]{8}$|^[a-z0-9_.-]{1,64}$/i';

    public function id(): string
    {
        return 'modrinth';
    }

    public function search(array $search): array
    {
        $facets = [['project_type:'.$search['type']]];

        if (($search['loaders'] ?? []) !== []) {
            $facets[] = array_map(static fn (string $loader): string => 'categories:'.$loader, $search['loaders']);
        }

        foreach ($search['categories'] ?? [] as $category) {
            $facets[] = ['categories:'.$category];
        }

        foreach ($search['excludeCategories'] ?? [] as $category) {
            $facets[] = ['categories!='.$category];
        }

        // Any of the chosen game versions matches.
        $gameVersions = array_values(array_filter($search['gameVersions'] ?? [$search['gameVersion'] ?? null]));
        if ($gameVersions !== []) {
            $facets[] = array_map(static fn (string $version): string => 'versions:'.$version, $gameVersions);
        }

        if ($search['serverSide'] ?? false) {
            $facets[] = ['server_side:required', 'server_side:optional'];
        }

        $sort = in_array($search['sort'] ?? 'relevance', self::SORTS, true) ? ($search['sort'] ?? 'relevance') : 'relevance';
        $query = [
            'query' => mb_substr((string) ($search['query'] ?? ''), 0, 100),
            'facets' => json_encode($facets),
            'index' => $sort,
            'offset' => max(0, min(10_000, (int) ($search['offset'] ?? 0))),
            'limit' => max(1, min(100, (int) ($search['limit'] ?? 20))),
        ];

        $data = $this->get('/search', $query, 120);

        return [
            'hits' => array_map(fn (array $hit): array => [
                'id' => $hit['project_id'],
                'slug' => $hit['slug'] ?? null,
                'title' => $hit['title'] ?? '',
                'description' => $hit['description'] ?? '',
                'author' => $hit['author'] ?? null,
                'icon' => $hit['icon_url'] ?? null,
                'gallery' => $hit['featured_gallery'] ?? ($hit['gallery'][0] ?? null),
                'color' => $hit['color'] ?? null,
                'downloads' => (int) ($hit['downloads'] ?? 0),
                'follows' => (int) ($hit['follows'] ?? 0),
                'updated' => $hit['date_modified'] ?? null,
                'categories' => array_values(array_diff($hit['display_categories'] ?? $hit['categories'] ?? [], self::LOADERS)),
                'loaders' => array_values(array_intersect($hit['categories'] ?? [], self::LOADERS)),
                'clientSide' => $hit['client_side'] ?? null,
                'gameVersions' => array_slice(array_reverse($hit['versions'] ?? []), 0, 5),
                'serverSide' => $hit['server_side'] ?? null,
                'url' => 'https://modrinth.com/'.($hit['project_type'] ?? 'project').'/'.($hit['slug'] ?? $hit['project_id']),
            ], $data['hits'] ?? []),
            'total' => (int) ($data['total_hits'] ?? 0),
        ];
    }

    /** Loader names that appear among a project's categories. */
    private const array LOADERS = [
        'paper', 'spigot', 'bukkit', 'purpur', 'folia', 'velocity', 'bungeecord', 'waterfall', 'sponge',
        'fabric', 'quilt', 'forge', 'neoforge', 'liteloader', 'datapack',
    ];

    public function categories(string $type): array
    {
        $type = $type === 'plugin' ? 'mod' : $type;
        $categories = $this->get('/tag/category', [], 86_400);

        return array_values(array_map(
            static fn (array $category): array => ['name' => $category['name'], 'icon' => self::svg($category['icon'] ?? null)],
            array_filter($categories, static fn (array $category): bool => ($category['project_type'] ?? null) === $type && ($category['header'] ?? null) === 'categories'),
        ));
    }

    public function loaders(string $type): array
    {
        return array_values(array_map(
            static fn (array $loader): array => ['name' => $loader['name'], 'icon' => self::svg($loader['icon'] ?? null)],
            array_filter($this->get('/tag/loader', [], 86_400), static fn (array $loader): bool => in_array($type, $loader['supported_project_types'] ?? [], true)),
        ));
    }

    public function gameVersions(): array
    {
        return array_map(
            static fn (array $version): array => ['version' => $version['version'], 'type' => $version['version_type'] ?? 'release'],
            $this->get('/tag/game_version', [], 3600),
        );
    }

    /**
     * Modrinth sends tag icons as SVG markup. Only plain drawing markup is passed on to the
     * browser; anything that could run script or load other content is dropped.
     */
    private static function svg(?string $markup): ?string
    {
        if (! is_string($markup) || strlen($markup) > 8000 || ! preg_match('#^\s*<svg[\s>][\s\S]*</svg>\s*$#i', $markup)) {
            return null;
        }

        if (preg_match('#<(script|foreignObject|iframe|image|use|a|style)\b|\bon[a-z]+\s*=|href|url\s*\(|javascript:#i', $markup)) {
            return null;
        }

        return trim($markup);
    }

    public function project(string $id): array
    {
        $this->assertId($id);
        $project = $this->get('/project/'.rawurlencode($id), [], 600);

        return [
            'id' => $project['id'],
            'slug' => $project['slug'] ?? null,
            'title' => $project['title'] ?? '',
            'description' => $project['description'] ?? '',
            'body' => mb_substr((string) ($project['body'] ?? ''), 0, 20_000),
            'icon' => $project['icon_url'] ?? null,
            'downloads' => (int) ($project['downloads'] ?? 0),
            'follows' => (int) ($project['followers'] ?? 0),
            'updated' => $project['updated'] ?? null,
            'categories' => $project['categories'] ?? [],
            'loaders' => $project['loaders'] ?? [],
            'gameVersions' => $project['game_versions'] ?? [],
            'serverSide' => $project['server_side'] ?? null,
            'clientSide' => $project['client_side'] ?? null,
            'license' => $project['license']['id'] ?? null,
            'source' => $project['source_url'] ?? null,
            'issues' => $project['issues_url'] ?? null,
            'type' => $project['project_type'] ?? null,
            'url' => 'https://modrinth.com/'.($project['project_type'] ?? 'project').'/'.($project['slug'] ?? $project['id']),
        ];
    }

    public function versions(string $projectId, array $loaders = [], array $gameVersions = []): array
    {
        $this->assertId($projectId);
        $query = [];
        if ($loaders !== []) {
            $query['loaders'] = json_encode(array_values($loaders));
        }

        if ($gameVersions !== []) {
            $query['game_versions'] = json_encode(array_values($gameVersions));
        }

        return array_map($this->normalizeVersion(...), $this->get('/project/'.rawurlencode($projectId).'/version', $query, 300));
    }

    public function version(string $id): array
    {
        $this->assertId($id);

        return $this->normalizeVersion($this->get('/version/'.rawurlencode($id), [], 600));
    }

    public function latestForHashes(array $sha1s, array $loaders, array $gameVersions): array
    {
        if ($sha1s === []) {
            return [];
        }

        $body = ['hashes' => array_values($sha1s), 'algorithm' => 'sha1'];
        if ($loaders !== []) {
            $body['loaders'] = array_values($loaders);
        }

        if ($gameVersions !== []) {
            $body['game_versions'] = array_values($gameVersions);
        }

        $data = $this->post('/version_files/update', $body);

        return array_map($this->normalizeVersion(...), is_array($data) ? $data : []);
    }

    public function versionsForHashes(array $sha1s): array
    {
        if ($sha1s === []) {
            return [];
        }

        $data = $this->post('/version_files', ['hashes' => array_values($sha1s), 'algorithm' => 'sha1']);

        return array_map($this->normalizeVersion(...), is_array($data) ? $data : []);
    }

    public function projects(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, fn (string $id): bool => preg_match(self::ID, $id) === 1)));
        if ($ids === []) {
            return [];
        }

        $result = [];
        foreach (array_chunk($ids, 100) as $chunk) {
            foreach ($this->get('/projects', ['ids' => json_encode($chunk)], 600) as $project) {
                $result[$project['id']] = [
                    'id' => $project['id'],
                    'slug' => $project['slug'] ?? null,
                    'title' => $project['title'] ?? '',
                    'icon' => $project['icon_url'] ?? null,
                    'url' => 'https://modrinth.com/'.($project['project_type'] ?? 'project').'/'.($project['slug'] ?? $project['id']),
                ];
            }
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $version
     * @return array<string, mixed>
     */
    private function normalizeVersion(array $version): array
    {
        return [
            'id' => $version['id'],
            'projectId' => $version['project_id'] ?? null,
            'name' => $version['name'] ?? '',
            'number' => $version['version_number'] ?? '',
            'type' => $version['version_type'] ?? 'release',
            'loaders' => $version['loaders'] ?? [],
            'gameVersions' => $version['game_versions'] ?? [],
            'published' => $version['date_published'] ?? null,
            'downloads' => (int) ($version['downloads'] ?? 0),
            'changelog' => mb_substr((string) ($version['changelog'] ?? ''), 0, 4000),
            'files' => array_map(static fn (array $file): array => [
                'url' => $file['url'],
                'filename' => $file['filename'],
                'size' => (int) ($file['size'] ?? 0),
                'sha1' => $file['hashes']['sha1'] ?? null,
                'sha512' => $file['hashes']['sha512'] ?? null,
                'primary' => (bool) ($file['primary'] ?? false),
            ], $version['files'] ?? []),
            'dependencies' => array_map(static fn (array $dependency): array => [
                'projectId' => $dependency['project_id'] ?? null,
                'versionId' => $dependency['version_id'] ?? null,
                'type' => $dependency['dependency_type'] ?? 'optional',
            ], $version['dependencies'] ?? []),
        ];
    }

    private function assertId(string $id): void
    {
        abort_unless(preg_match(self::ID, $id) === 1, 422, 'Invalid project or version id.');
    }

    private function client(): PendingRequest
    {
        return Http::withUserAgent(McJars::USER_AGENT)->acceptJson()->timeout(15)->baseUrl(self::BASE);
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<mixed>
     */
    private function get(string $path, array $query, int $ttl): array
    {
        $key = 'ext:mc-suite:modrinth:'.sha1($path.'?'.http_build_query($query));

        return Cache::remember($key, $ttl, function () use ($path, $query): array {
            $response = $this->client()->get($path, $query);
            if ($response->status() === 404) {
                abort(404, 'Not found on Modrinth.');
            }

            $data = $response->json();
            if (! $response->successful() || ! is_array($data)) {
                throw new RuntimeException('Modrinth did not answer: '.$response->status());
            }

            return $data;
        });
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<mixed>
     */
    private function post(string $path, array $body): array
    {
        $key = 'ext:mc-suite:modrinth:'.sha1($path.json_encode($body));

        return Cache::remember($key, 300, function () use ($path, $body): array {
            $response = $this->client()->post($path, $body);
            $data = $response->json();
            if (! $response->successful() || ! is_array($data)) {
                throw new RuntimeException('Modrinth did not answer: '.$response->status());
            }

            return $data;
        });
    }
}
