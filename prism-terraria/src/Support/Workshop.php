<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The tModLoader Steam Workshop (app 1281930), through the Steam Web API. Browsing needs the
 * Steam Web API key from the extension's admin settings.
 */
final class Workshop
{
    public const int APP = 1281930;

    /** tModLoader's own Workshop categories. */
    public const array CATEGORIES = ['New Content', 'Utilities', 'Library', 'Quality of Life', 'Gameplay Tweaks', 'Audio Tweaks', 'Visual Tweaks', 'Custom World Gen', 'Translation'];

    /** Where a mod runs. Client-only mods do nothing on a server. */
    public const array SIDES = ['Both', 'Server', 'NoSync', 'Client'];

    public const array GAME_VERSIONS = ['1.4.4', '1.4.3'];

    /** Steam's EPublishedFileQueryType for each sort order. */
    private const array SORTS = ['trend' => 3, 'subscriptions' => 9, 'newest' => 1, 'updated' => 21, 'votes' => 0];

    private const string API = 'https://api.steampowered.com/';

    public static function key(): string
    {
        $key = Settings::admin('steam_api_key', '');

        return is_string($key) ? trim($key) : '';
    }

    public static function configured(): bool
    {
        return self::key() !== '';
    }

    /**
     * One page of Workshop items.
     *
     * @param  array{query?: string, sort?: string, categories?: list<string>, sides?: list<string>, gameVersion?: string|null, page?: int, limit?: int}  $params
     * @return array{total: int, hits: list<array<string, mixed>>}
     */
    public static function search(array $params): array
    {
        $text = trim((string) ($params['query'] ?? ''));
        $query = [
            'appid' => self::APP,
            'query_type' => $text !== '' ? 12 : (self::SORTS[$params['sort'] ?? 'trend'] ?? 3),
            'page' => max(1, (int) ($params['page'] ?? 1)),
            'numperpage' => min(50, max(1, (int) ($params['limit'] ?? 20))),
            'return_tags' => 'true',
            'return_previews' => 'true',
            'return_children' => 'true',
            'return_short_description' => 'true',
            'return_vote_data' => 'true',
            'match_all_tags' => 'true',
            'filetype' => 0,
        ];

        if ($text !== '') {
            $query['search_text'] = mb_substr($text, 0, 100);
        } elseif (($params['sort'] ?? 'trend') === 'trend') {
            $query['days'] = 30;
            $query['include_recent_votes_only'] = 'true';
        }

        $required = array_values(array_intersect($params['categories'] ?? [], self::CATEGORIES));
        if (in_array($params['gameVersion'] ?? null, self::GAME_VERSIONS, true)) {
            $required[] = $params['gameVersion'];
        }

        foreach ($required as $index => $tag) {
            $query["requiredtags[$index]"] = $tag;
        }

        // Mod Side is one tag per mod, so several sides are an either-or: the rest are excluded.
        $sides = array_values(array_intersect($params['sides'] ?? [], self::SIDES));
        if ($sides !== []) {
            foreach (array_values(array_diff(self::SIDES, $sides)) as $index => $tag) {
                $query["excludedtags[$index]"] = $tag;
            }
        }

        $response = Cache::remember('ext:prism-terraria:workshop:search:'.md5(serialize($query)), 300, static fn (): array => self::call('IPublishedFileService/QueryFiles/v1/', $query));
        $items = $response['publishedfiledetails'] ?? [];

        return [
            'total' => (int) ($response['total'] ?? 0),
            'hits' => self::present(is_array($items) ? $items : []),
        ];
    }

    /**
     * Full details of some items, with their descriptions, screenshots and required mods.
     *
     * @param  list<string>  $ids
     * @return array<string, array<string, mixed>> keyed by Workshop id
     */
    public static function details(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, static fn ($id): bool => is_string($id) && preg_match('/^\d{1,20}$/', $id) === 1)));
        if ($ids === []) {
            return [];
        }

        $result = [];
        $missing = [];
        foreach ($ids as $id) {
            $cached = Cache::get('ext:prism-terraria:workshop:item:'.$id);
            if (is_array($cached)) {
                $result[$id] = $cached;
            } else {
                $missing[] = $id;
            }
        }

        foreach (array_chunk($missing, 50) as $chunk) {
            $query = ['includetags' => 'true', 'includeadditionalpreviews' => 'true', 'includechildren' => 'true', 'includevotes' => 'true', 'appid' => self::APP];
            foreach ($chunk as $index => $id) {
                $query["publishedfileids[$index]"] = $id;
            }

            $items = self::call('IPublishedFileService/GetDetails/v1/', $query)['publishedfiledetails'] ?? [];
            foreach (self::present(is_array($items) ? $items : [], true) as $item) {
                Cache::put('ext:prism-terraria:workshop:item:'.$item['id'], $item, 600);
                $result[$item['id']] = $item;
            }
        }

        return $result;
    }

    /**
     * The items and every mod they need, following required items a few levels deep.
     *
     * @param  list<string>  $ids
     * @return array<string, array<string, mixed>>
     */
    public static function withDependencies(array $ids): array
    {
        $all = [];
        $next = $ids;
        for ($depth = 0; $depth < 4 && $next !== []; $depth++) {
            $found = self::details($next);
            $all += $found;
            $next = [];
            foreach ($found as $item) {
                foreach ($item['dependencies'] as $child) {
                    if (! isset($all[$child])) {
                        $next[] = $child;
                    }
                }
            }
        }

        return $all;
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<array<string, mixed>>
     */
    private static function present(array $items, bool $full = false): array
    {
        $items = array_values(array_filter($items, static fn ($item): bool => is_array($item) && (int) ($item['result'] ?? 1) === 1 && isset($item['publishedfileid'])));
        $authors = self::authors(array_column($items, 'creator'));

        return array_map(static function (array $item) use ($authors, $full): array {
            $tags = array_values(array_filter(array_map(static fn ($tag) => is_array($tag) ? (string) ($tag['tag'] ?? '') : '', $item['tags'] ?? [])));
            $votes = $item['vote_data'] ?? [];

            $hit = [
                'id' => (string) $item['publishedfileid'],
                'title' => (string) ($item['title'] ?? 'Untitled'),
                'description' => self::plain((string) ($item['short_description'] ?? $item['file_description'] ?? ''), 300),
                'author' => $authors[(string) ($item['creator'] ?? '')] ?? null,
                'icon' => isset($item['preview_url']) && $item['preview_url'] !== '' ? (string) $item['preview_url'] : null,
                'subscriptions' => (int) ($item['lifetime_subscriptions'] ?? $item['subscriptions'] ?? 0),
                'favorites' => (int) ($item['lifetime_favorited'] ?? $item['favorited'] ?? 0),
                'score' => isset($votes['score']) ? round((float) $votes['score'], 3) : null,
                'size' => (int) ($item['file_size'] ?? 0),
                'created' => isset($item['time_created']) ? date(DATE_ATOM, (int) $item['time_created']) : null,
                'updated' => isset($item['time_updated']) ? (int) $item['time_updated'] : null,
                'categories' => array_values(array_intersect($tags, self::CATEGORIES)),
                'side' => array_values(array_intersect($tags, self::SIDES))[0] ?? null,
                'gameVersions' => array_values(array_intersect($tags, self::GAME_VERSIONS)),
                'dependencies' => array_values(array_map(static fn ($child): string => (string) ($child['publishedfileid'] ?? ''), array_filter($item['children'] ?? [], static fn ($child): bool => is_array($child) && isset($child['publishedfileid'])))),
                'url' => 'https://steamcommunity.com/sharedfiles/filedetails/?id='.$item['publishedfileid'],
            ];

            if ($full) {
                $hit['body'] = self::plain((string) ($item['file_description'] ?? ''), 20000);
                $hit['screenshots'] = array_values(array_filter(array_map(
                    static fn ($preview) => is_array($preview) && (int) ($preview['preview_type'] ?? -1) === 0 && isset($preview['url']) ? (string) $preview['url'] : null,
                    $item['previews'] ?? [],
                )));
            }

            return $hit;
        }, $items);
    }

    /**
     * Steam display names of the given accounts.
     *
     * @param  list<mixed>  $ids
     * @return array<string, string>
     */
    private static function authors(array $ids): array
    {
        $ids = array_values(array_unique(array_filter(array_map('strval', $ids), static fn (string $id): bool => preg_match('/^\d{17}$/', $id) === 1)));
        $names = [];
        $missing = [];
        foreach ($ids as $id) {
            $name = Cache::get('ext:prism-terraria:steam-user:'.$id);
            is_string($name) ? $names[$id] = $name : $missing[] = $id;
        }

        foreach (array_chunk($missing, 100) as $chunk) {
            try {
                $players = self::call('ISteamUser/GetPlayerSummaries/v2/', ['steamids' => implode(',', $chunk)], 'GET')['players'] ?? [];
            } catch (RuntimeException) {
                break;
            }

            foreach (is_array($players) ? $players : [] as $player) {
                if (isset($player['steamid'], $player['personaname'])) {
                    $names[(string) $player['steamid']] = (string) $player['personaname'];
                    Cache::put('ext:prism-terraria:steam-user:'.$player['steamid'], (string) $player['personaname'], 86400);
                }
            }
        }

        return $names;
    }

    /** Workshop descriptions are BBCode; the dialog shows them as plain text with line breaks. */
    private static function plain(string $text, int $limit): string
    {
        $text = (string) preg_replace('/\[url=([^\]]*)\](.*?)\[\/url\]/is', '$2 ($1)', $text);
        $text = (string) preg_replace('/\[img\].*?\[\/img\]/is', '', $text);
        // Short descriptions arrive with the tags already gone, leaving bare image links.
        $text = (string) preg_replace('/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)\b\S*/i', '', $text);
        $text = (string) preg_replace('/\[\*\]/', '• ', $text);
        $text = (string) preg_replace('/\[\/?[a-z0-9]+(=[^\]]*)?\]/i', '', $text);
        $text = trim((string) preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $text)));

        return mb_strlen($text) > $limit ? mb_substr($text, 0, $limit - 1).'…' : $text;
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private static function call(string $method, array $query, string $verb = 'GET'): array
    {
        $key = self::key();
        throw_if($key === '', RuntimeException::class, 'An administrator needs to add a Steam Web API key in the Prism Terraria settings to browse the Workshop.');

        /** @var Response $response */
        $response = Http::withUserAgent(Settings::USER_AGENT)->timeout(20)->retry(2, 500, throw: false)->get(self::API.$method, ['key' => $key, ...$query]);

        throw_if(in_array($response->status(), [401, 403], true), RuntimeException::class, 'Steam refused the Steam Web API key. An administrator should check it in the Prism Terraria settings.');
        throw_unless($response->successful(), RuntimeException::class, 'The Steam Workshop did not answer (HTTP '.$response->status().'). Try again in a moment.');

        $body = $response->json();
        $data = $body['response'] ?? $body;

        return is_array($data) ? $data : [];
    }
}
