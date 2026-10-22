<?php

declare(strict_types=1);

namespace TerrariaSuite\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * TShock plugins listed in the README of github.com/Pryaxis/plugins. The list is no longer
 * kept up to date, but its downloads still work. Each entry looks like:
 *
 *   * [Name](homepage) by [Author](link)
 *     * Description.
 *     * Tested on TShock 5.2.1.
 *     * [Download Version 1.0](https://…/Plugin-1.0.dll)
 *     * [Source code](https://…)
 */
final class PluginCatalog
{
    public const string README = 'https://raw.githubusercontent.com/Pryaxis/plugins/master/README.md';

    public const string REPOSITORY = 'https://github.com/Pryaxis/plugins';

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return Cache::remember('ext:terraria-suite:plugin-catalog', 86400, static function (): array {
            $response = Http::withUserAgent(Settings::USER_AGENT)->timeout(20)->get(self::README);
            throw_unless($response->successful(), RuntimeException::class, 'The TShock plugin list on GitHub did not answer. Try again in a moment.');

            return self::parse($response->body());
        });
    }

    /** @return array<string, mixed>|null */
    public static function find(string $id): ?array
    {
        foreach (self::all() as $plugin) {
            if ($plugin['id'] === $id) {
                return $plugin;
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    public static function parse(string $markdown): array
    {
        $plugins = [];
        $section = null;
        $current = null;

        $flush = static function () use (&$current, &$plugins): void {
            if ($current !== null) {
                $id = Str::slug($current['name']) ?: 'plugin';
                $suffix = 2;
                $base = $id;
                while (in_array($id, array_column($plugins, 'id'), true)) {
                    $id = $base.'-'.$suffix++;
                }

                $plugins[] = ['id' => $id] + $current;
            }

            $current = null;
        };

        foreach (preg_split('/\R/', $markdown) ?: [] as $line) {
            if (preg_match('/^#{2,4}\s+(.*)$/', $line, $heading) === 1) {
                $flush();
                $title = strtolower(trim($heading[1]));
                $section = match (true) {
                    str_starts_with($title, 'list of all plugins') => 'listed',
                    str_starts_with($title, 'community maintained') => 'community',
                    str_contains($title, 'older tshock') => 'older',
                    default => null,
                };

                continue;
            }

            if ($section === null) {
                continue;
            }

            if (preg_match('/^\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+by\s+(.*))?$/', rtrim($line), $match) === 1) {
                $flush();
                $current = [
                    'name' => trim($match[1]),
                    'homepage' => trim($match[2]),
                    'author' => isset($match[3]) ? trim((string) preg_replace('/\[([^\]]+)\]\([^)]*\)/', '$1', $match[3])) : null,
                    'description' => '',
                    'tested' => null,
                    'download' => null,
                    'downloadPage' => null,
                    'version' => null,
                    'source' => null,
                    'docs' => null,
                    'section' => $section,
                ];

                continue;
            }

            if ($current === null || preg_match('/^\s+\*\s+(.*)$/', $line, $item) !== 1) {
                continue;
            }

            $text = trim($item[1]);
            if (preg_match('/(?:tested|built)(?: and tested)? on tshock ([0-9][0-9a-z .-]*?)\.?$/i', $text, $tested) === 1) {
                $current['tested'] ??= trim($tested[1]);
            } elseif (preg_match('/^\[?(download[^\]]*?)\]?\(?\s*(https?:\/\/[^)\s]+)\)?/i', $text, $download) === 1) {
                if (str_contains(strtolower($text), 'mirror')) {
                    continue;
                }

                $url = $download[2];
                if (preg_match('/\.(dll|zip)$/i', (string) parse_url($url, PHP_URL_PATH)) === 1) {
                    $current['download'] ??= $url;
                    // "Download Version 1.2.0", "Download v1.7.0" or "Download 1.8".
                    $current['version'] ??= preg_match('/(\d+(?:\.\d+)+)/', $download[1], $version) === 1 ? $version[1] : null;
                } else {
                    $current['downloadPage'] ??= $url;
                }
            } elseif (preg_match('/^\[source code\]\(([^)]+)\)/i', $text, $source) === 1) {
                $current['source'] = $source[1];
            } elseif (preg_match('/^\[documentation\]\(([^)]+)\)/i', $text, $docs) === 1) {
                $current['docs'] = $docs[1];
            } elseif ($current['description'] === '' && ! str_starts_with($text, '[')) {
                $current['description'] = (string) preg_replace('/\[([^\]]+)\]\([^)]*\)/', '$1', $text);
            }
        }

        $flush();

        // The README ends with an example entry for people submitting plugins.
        return array_values(array_filter($plugins, static fn (array $plugin): bool => ! str_contains($plugin['homepage'], 'example.com')));
    }
}
