<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support\Sources;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismCoreKeeper\Support\Settings;
use RuntimeException;

/**
 * Core Keeper's Steam Workshop (app 1621690), through the Steam Web API with the key from
 * Prism Properties. Steam gives no download address for these files: the game server fetches
 * them with a Steam client when it starts (see StartHook).
 */
final class Workshop implements Source
{
    /** Steam's EPublishedFileQueryType for each sort order. */
    private const array SORTS = ['popular' => 3, 'downloads' => 9, 'rating' => 0, 'newest' => 1, 'updated' => 21];

    private const string API = 'https://api.steampowered.com/';

    public function configured(): bool
    {
        return Settings::string('steam_api_key') !== '';
    }

    public function search(array $params): array
    {
        $text = trim((string) ($params['query'] ?? ''));
        $sort = $params['sort'] ?? 'popular';
        $query = [
            'appid' => Settings::GAME_APP,
            'query_type' => $text !== '' ? 12 : (self::SORTS[$sort] ?? 3),
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
        } elseif ($sort === 'popular') {
            $query['days'] = 30;
            $query['include_recent_votes_only'] = 'true';
        }

        $required = [...array_values(array_intersect($params['categories'] ?? [], Mods::CATEGORIES)), ...array_values(array_intersect($params['sides'] ?? [], Mods::SIDES))];
        if (is_string($params['gameVersion'] ?? null) && preg_match('/^\d+(\.\d+){1,4}$/', $params['gameVersion'])) {
            $required[] = $params['gameVersion'];
        }
        foreach ($required as $index => $tag) {
            $query["requiredtags[$index]"] = $tag;
        }

        $response = Cache::remember('ext:prism-corekeeper:workshop:search:'.md5(serialize($query)), 300, static fn (): array => self::call('IPublishedFileService/QueryFiles/v1/', $query));
        $items = $response['publishedfiledetails'] ?? [];

        return [
            'total' => (int) ($response['total'] ?? 0),
            'hits' => self::present(is_array($items) ? $items : []),
        ];
    }

    public function details(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, static fn ($id): bool => is_string($id) && preg_match('/^\d{1,20}$/', $id) === 1)));
        $result = [];
        $missing = [];
        foreach ($ids as $id) {
            $cached = Cache::get('ext:prism-corekeeper:workshop:item:'.$id);
            is_array($cached) ? $result[$cached['id']] = $cached : $missing[] = $id;
        }

        foreach (array_chunk($missing, 50) as $chunk) {
            $query = ['includetags' => 'true', 'includeadditionalpreviews' => 'true', 'includechildren' => 'true', 'includevotes' => 'true', 'appid' => Settings::GAME_APP];
            foreach ($chunk as $index => $id) {
                $query["publishedfileids[$index]"] = $id;
            }

            $items = self::call('IPublishedFileService/GetDetails/v1/', $query)['publishedfiledetails'] ?? [];
            foreach (self::present(is_array($items) ? $items : [], true) as $item) {
                Cache::put('ext:prism-corekeeper:workshop:item:'.$item['sourceId'], $item, 600);
                $result[$item['id']] = $item;
            }
        }

        return $result;
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<array<string, mixed>>
     */
    private static function present(array $items, bool $full = false): array
    {
        $items = array_values(array_filter($items, static fn ($item): bool => is_array($item) && (int) ($item['result'] ?? 1) === 1 && isset($item['publishedfileid']) && (int) ($item['consumer_appid'] ?? Settings::GAME_APP) === Settings::GAME_APP));
        $authors = self::authors(array_column($items, 'creator'));

        return array_map(static function (array $item) use ($authors, $full): array {
            $tags = array_values(array_filter(array_map(static fn ($tag) => is_array($tag) ? (string) ($tag['tag'] ?? '') : '', $item['tags'] ?? [])));
            $votes = $item['vote_data'] ?? [];
            $id = (string) $item['publishedfileid'];

            $hit = [
                'id' => 'steam:'.$id,
                'source' => 'steam',
                'sourceId' => $id,
                'title' => (string) ($item['title'] ?? 'Untitled'),
                'summary' => self::plain((string) ($item['short_description'] ?? $item['file_description'] ?? ''), 300),
                'author' => $authors[(string) ($item['creator'] ?? '')] ?? null,
                'icon' => isset($item['preview_url']) && $item['preview_url'] !== '' ? (string) $item['preview_url'] : null,
                'url' => 'https://steamcommunity.com/sharedfiles/filedetails/?id='.$id,
                'downloads' => (int) ($item['lifetime_subscriptions'] ?? $item['subscriptions'] ?? 0),
                'score' => isset($votes['score']) ? round((float) $votes['score'], 3) : null,
                'size' => (int) ($item['file_size'] ?? 0),
                'created' => (int) ($item['time_created'] ?? 0),
                'updated' => (int) ($item['time_updated'] ?? 0),
                'categories' => array_values(array_intersect($tags, Mods::CATEGORIES)),
                'sides' => array_values(array_intersect($tags, Mods::SIDES)),
                'gameVersions' => array_values(array_filter($tags, static fn (string $tag): bool => preg_match('/^\d+(\.\d+){1,4}$/', $tag) === 1)),
                'dependencies' => array_values(array_map(static fn ($child): string => 'steam:'.$child['publishedfileid'], array_filter($item['children'] ?? [], static fn ($child): bool => is_array($child) && isset($child['publishedfileid'])))),
                'version' => null,
                'file' => null,
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
            $name = Cache::get('ext:prism-corekeeper:steam-user:'.$id);
            is_string($name) ? $names[$id] = $name : $missing[] = $id;
        }

        foreach (array_chunk($missing, 100) as $chunk) {
            try {
                $players = self::call('ISteamUser/GetPlayerSummaries/v2/', ['steamids' => implode(',', $chunk)])['players'] ?? [];
            } catch (RuntimeException) {
                break;
            }

            foreach (is_array($players) ? $players : [] as $player) {
                if (isset($player['steamid'], $player['personaname'])) {
                    $names[(string) $player['steamid']] = (string) $player['personaname'];
                    Cache::put('ext:prism-corekeeper:steam-user:'.$player['steamid'], (string) $player['personaname'], 86400);
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
    private static function call(string $method, array $query): array
    {
        $key = Settings::string('steam_api_key');
        throw_if($key === '', RuntimeException::class, 'An administrator needs to add a Steam Web API key in Prism Properties to browse the Workshop.');

        /** @var Response $response */
        $response = Http::withUserAgent(Settings::USER_AGENT)->timeout(20)->retry(2, 500, throw: false)->get(self::API.$method, ['key' => $key, ...$query]);

        throw_if(in_array($response->status(), [401, 403], true), RuntimeException::class, 'Steam refused the Steam Web API key. An administrator should check it in Prism Properties.');
        throw_unless($response->successful(), RuntimeException::class, 'The Steam Workshop did not answer (HTTP '.$response->status().'). Try again in a moment.');

        $body = $response->json();
        $data = $body['response'] ?? $body;

        return is_array($data) ? $data : [];
    }
}
