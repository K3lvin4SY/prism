<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support\Sources;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismCoreKeeper\Support\Settings;
use RuntimeException;

/**
 * Core Keeper on mod.io (game 5289), read with the API key from Prism Properties. Mod files
 * are zips with a ModManifest.json; their download address forwards to mod.io's CDN.
 */
final class ModIo implements Source
{
    public const int GAME = 5289;

    private const string API = 'https://g-5289.modapi.io/v1/games/5289';

    private const array SORTS = ['popular' => '-popular', 'downloads' => '-downloads_total', 'rating' => '-rating', 'newest' => '-date_added', 'updated' => '-date_updated'];

    public function configured(): bool
    {
        return self::key() !== '';
    }

    private static function key(): string
    {
        return Settings::string('modio_api_key');
    }

    public function search(array $params): array
    {
        $query = [
            '_limit' => min(50, max(1, (int) ($params['limit'] ?? 20))),
            '_offset' => (max(1, (int) ($params['page'] ?? 1)) - 1) * min(50, max(1, (int) ($params['limit'] ?? 20))),
            '_sort' => self::SORTS[$params['sort'] ?? 'popular'] ?? '-popular',
        ];

        $text = trim((string) ($params['query'] ?? ''));
        if ($text !== '') {
            $query['_q'] = mb_substr($text, 0, 100);
        }

        // Several tags must all be present, as on the Workshop.
        $tags = [...array_values(array_intersect($params['categories'] ?? [], Mods::CATEGORIES)), ...array_values(array_intersect($params['sides'] ?? [], Mods::SIDES))];
        if (is_string($params['gameVersion'] ?? null) && preg_match('/^\d+(\.\d+){1,4}$/', $params['gameVersion'])) {
            $tags[] = $params['gameVersion'];
        }
        if ($tags !== []) {
            $query['tags'] = implode(',', $tags);
        }

        $response = Cache::remember('ext:prism-corekeeper:modio:search:'.md5(serialize($query)), 300, static fn (): array => self::get('/mods', $query));

        return [
            'total' => (int) ($response['result_total'] ?? 0),
            'hits' => array_map(self::present(...), array_values(array_filter($response['data'] ?? [], 'is_array'))),
        ];
    }

    public function details(array $ids): array
    {
        $result = [];
        foreach ($ids as $id) {
            if (! preg_match('/^\d{1,12}$/', $id)) {
                continue;
            }

            $mod = Cache::remember('ext:prism-corekeeper:modio:mod:'.$id, 600, static function () use ($id): array {
                $mod = self::get('/mods/'.$id);
                $hit = self::present($mod, true);
                if (($mod['dependencies'] ?? false) === true) {
                    $dependencies = self::get('/mods/'.$id.'/dependencies')['data'] ?? [];
                    $hit['dependencies'] = array_values(array_map(static fn (array $dependency): string => 'modio:'.$dependency['mod_id'], array_filter($dependencies, static fn ($dependency): bool => is_array($dependency) && isset($dependency['mod_id']))));
                }

                return $hit;
            });
            $result[$mod['id']] = $mod;
        }

        return $result;
    }

    /** The game versions mod.io lists for Core Keeper, newest first. */
    public static function gameVersions(): array
    {
        if (self::key() === '') {
            return [];
        }

        return Cache::remember('ext:prism-corekeeper:modio:versions', 3600, static function (): array {
            foreach (self::get('')['tag_options'] ?? [] as $group) {
                if (is_array($group) && ($group['name'] ?? '') === 'Game Version') {
                    return array_values(array_map('strval', $group['tags'] ?? []));
                }
            }

            return [];
        });
    }

    /**
     * @param  array<string, mixed>  $mod
     * @return array<string, mixed>
     */
    private static function present(array $mod, bool $full = false): array
    {
        $tags = array_values(array_map(static fn ($tag): string => is_array($tag) ? (string) ($tag['name'] ?? '') : '', $mod['tags'] ?? []));
        $stats = $mod['stats'] ?? [];
        $file = is_array($mod['modfile'] ?? null) ? $mod['modfile'] : null;

        $hit = [
            'id' => 'modio:'.$mod['id'],
            'source' => 'modio',
            'sourceId' => (string) $mod['id'],
            'title' => (string) ($mod['name'] ?? 'Untitled'),
            'summary' => (string) ($mod['summary'] ?? ''),
            'author' => $mod['submitted_by']['username'] ?? null,
            'icon' => $mod['logo']['thumb_320x180'] ?? $mod['logo']['original'] ?? null,
            'url' => (string) ($mod['profile_url'] ?? 'https://mod.io/g/corekeeper/m/'.($mod['name_id'] ?? $mod['id'])),
            'downloads' => (int) ($stats['downloads_total'] ?? 0),
            'score' => isset($stats['ratings_weighted_aggregate']) ? round((float) $stats['ratings_weighted_aggregate'], 3) : null,
            'size' => (int) ($file['filesize'] ?? 0),
            'created' => (int) ($mod['date_added'] ?? 0),
            'updated' => (int) ($mod['date_updated'] ?? 0),
            'categories' => array_values(array_intersect($tags, Mods::CATEGORIES)),
            'sides' => array_values(array_intersect($tags, Mods::SIDES)),
            'gameVersions' => array_values(array_filter($tags, static fn (string $tag): bool => preg_match('/^\d+(\.\d+){1,4}$/', $tag) === 1)),
            'dependencies' => [],
            'version' => $file['version'] ?? null,
            'file' => $file === null ? null : [
                'id' => (string) $file['id'],
                'url' => (string) ($file['download']['binary_url'] ?? ''),
                'filename' => (string) ($file['filename'] ?? 'mod.zip'),
                'size' => (int) ($file['filesize'] ?? 0),
                'md5' => $file['filehash']['md5'] ?? null,
            ],
        ];

        if ($full) {
            $hit['body'] = mb_substr(trim((string) ($mod['description_plaintext'] ?? $mod['summary'] ?? '')), 0, 20000);
            $hit['screenshots'] = array_values(array_filter(array_map(static fn ($image) => is_array($image) ? ($image['thumb_1280x720'] ?? $image['original'] ?? null) : null, $mod['media']['images'] ?? [])));
        }

        return $hit;
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private static function get(string $path, array $query = []): array
    {
        $key = self::key();
        throw_if($key === '', RuntimeException::class, 'An administrator needs to add a mod.io API key in Prism Properties.');

        /** @var Response $response */
        $response = Http::withUserAgent(Settings::USER_AGENT)->acceptJson()->timeout(20)->retry(2, 500, throw: false)->get(self::API.$path, ['api_key' => $key, ...$query]);

        throw_if(in_array($response->status(), [401, 403], true), RuntimeException::class, 'mod.io refused the API key. An administrator should check it in Prism Properties.');
        throw_if($response->status() === 429, RuntimeException::class, 'mod.io asked us to slow down. Try again in a minute.');
        throw_unless($response->successful(), RuntimeException::class, 'mod.io did not answer (HTTP '.$response->status().'). Try again in a moment.');

        $body = $response->json();

        return is_array($body) ? $body : [];
    }
}
