<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support\Sources;

use InvalidArgumentException;

/**
 * Both sources together: searching one or both, details for "source:id" ids, and the
 * dependencies a mod needs, followed a few levels deep.
 */
final class Mods
{
    /** Core Keeper's mod types, as both mod.io and the Workshop tag them. */
    public const array CATEGORIES = ['Quality of Life', 'Library', 'Item', 'Visual', 'Audio', 'NPC', 'World', 'Mining', 'Overhaul', 'Language', 'Other'];

    public const array SIDES = ['Server', 'Client'];

    public const array SORTS = ['popular', 'downloads', 'rating', 'newest', 'updated'];

    public static function source(string $name): Source
    {
        return match ($name) {
            'modio' => new ModIo,
            'steam' => new Workshop,
            default => throw new InvalidArgumentException('Unknown mod source '.$name.'.'),
        };
    }

    /** @return array{0: string, 1: string} source and id */
    public static function split(string $id): array
    {
        if (! preg_match('/^(modio|steam):(\d{1,20})$/', $id, $match)) {
            throw new InvalidArgumentException('Not a mod id: '.$id);
        }

        return [$match[1], $match[2]];
    }

    /**
     * Searches the chosen sources. With both, each is asked for the same page and the results
     * are interleaved by the sort, and a mod published on both shows once, with `alsoOn`.
     *
     * @param  list<string>  $sources
     * @param  array<string, mixed>  $params
     * @return array{total: int, hits: list<array<string, mixed>>, errors: array<string, string>}
     */
    public static function search(array $sources, array $params): array
    {
        $sources = array_values(array_intersect(['modio', 'steam'], $sources ?: ['modio', 'steam']));
        $results = [];
        $errors = [];
        foreach ($sources as $name) {
            $source = self::source($name);
            if (! $source->configured()) {
                $errors[$name] = $name === 'modio' ? 'An administrator needs to add a mod.io API key in Prism Properties.' : 'An administrator needs to add a Steam Web API key in Prism Properties.';

                continue;
            }

            try {
                $results[$name] = $source->search($params);
            } catch (\RuntimeException $exception) {
                $errors[$name] = $exception->getMessage();
            }
        }

        $total = array_sum(array_map(static fn (array $result): int => $result['total'], $results));
        $lists = array_map(static fn (array $result): array => $result['hits'], array_values($results));

        return ['total' => $total, 'hits' => self::merge($lists, (string) ($params['sort'] ?? 'popular')), 'errors' => $errors];
    }

    /**
     * @param  list<list<array<string, mixed>>>  $lists
     * @return list<array<string, mixed>>
     */
    public static function merge(array $lists, string $sort): array
    {
        $key = match ($sort) {
            'downloads' => 'downloads',
            'rating' => 'score',
            'newest' => 'created',
            'updated' => 'updated',
            default => null,
        };

        // Popularity is measured differently at each source, so the lists take turns.
        $merged = [];
        if ($key === null) {
            for ($i = 0; $i < max(0, ...array_map('count', $lists ?: [[]])); $i++) {
                foreach ($lists as $list) {
                    if (isset($list[$i])) {
                        $merged[] = $list[$i];
                    }
                }
            }
        } else {
            $merged = array_merge(...($lists ?: [[]]));
            usort($merged, static fn (array $a, array $b): int => ($b[$key] ?? 0) <=> ($a[$key] ?? 0));
        }

        // The same mod on both: one card, the first one seen, pointing at the other.
        $seen = [];
        $out = [];
        foreach ($merged as $hit) {
            $name = self::nameKey((string) $hit['title']);
            if ($name !== '' && isset($seen[$name]) && $out[$seen[$name]]['source'] !== $hit['source']) {
                $out[$seen[$name]]['alsoOn'] = ['source' => $hit['source'], 'id' => $hit['id'], 'url' => $hit['url']];

                continue;
            }
            $seen[$name] ??= count($out);
            $out[] = $hit;
        }

        return $out;
    }

    /** A mod's name for matching across sources: letters and digits only. */
    public static function nameKey(string $title): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', mb_strtolower($title));
    }

    /**
     * @param  list<string>  $ids  "source:id"
     * @return array<string, array<string, mixed>>
     */
    public static function details(array $ids): array
    {
        $bySource = [];
        foreach ($ids as $id) {
            [$source, $sourceId] = self::split($id);
            $bySource[$source][] = $sourceId;
        }

        $result = [];
        foreach ($bySource as $source => $sourceIds) {
            $result += self::source($source)->details(array_values(array_unique($sourceIds)));
        }

        return $result;
    }

    /**
     * The mods and every mod they need, a few levels deep, dependencies first.
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
            $all = $found + $all;
            $next = [];
            foreach ($found as $mod) {
                foreach ($mod['dependencies'] ?? [] as $dependency) {
                    if (! isset($all[$dependency])) {
                        $next[] = $dependency;
                    }
                }
            }
        }

        // Dependencies first, so libraries are in place before the mods that need them.
        $ordered = [];
        $visiting = [];
        $visit = function (string $id) use (&$visit, &$ordered, &$visiting, $all): void {
            if (isset($ordered[$id]) || isset($visiting[$id]) || ! isset($all[$id])) {
                return;
            }
            $visiting[$id] = true;
            foreach ($all[$id]['dependencies'] ?? [] as $dependency) {
                $visit($dependency);
            }
            $ordered[$id] = $all[$id];
        };
        foreach (array_keys($all) as $id) {
            $visit($id);
        }

        return $ordered;
    }
}
