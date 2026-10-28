<?php

declare(strict_types=1);

namespace PrismShare\Support;

/**
 * Paths inside a server, made comparable. Wings keeps every path inside the server, but not
 * inside the folders a link shares, so these checks decide that.
 */
final class SharePath
{
    /**
     * The path with one leading slash and no trailing one, `\` as `/`, and `.`, `..` and empty
     * parts resolved; null when it is not a plain path or climbs above the server's root.
     */
    public static function normalize(mixed $path): ?string
    {
        if (! is_string($path) || $path === '' || strlen($path) > 4096 || preg_match('/[\x00-\x1F\x7F]/', $path)) {
            return null;
        }

        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                if ($parts === []) {
                    return null;
                }
                array_pop($parts);

                continue;
            }
            $parts[] = $part;
        }

        return '/'.implode('/', $parts);
    }

    /** Whether the path is the shared path or inside it: `/world` holds `/world/level.dat`, never `/world2`. */
    public static function within(string $path, string $shared): bool
    {
        return $shared === '/' || $path === $shared || str_starts_with($path, rtrim($shared, '/').'/');
    }

    /**
     * The shared path that holds this one, if any.
     *
     * @param  list<string>  $shared  normalized paths
     */
    public static function root(string $path, array $shared): ?string
    {
        foreach ($shared as $entry) {
            if (self::within($path, $entry)) {
                return $entry;
            }
        }

        return null;
    }

    /** @return string the folder the path is in; the root for `/` and top-level entries */
    public static function parent(string $path): string
    {
        $parent = dirname($path);

        return $parent === '.' || $parent === '\\' ? '/' : $parent;
    }
}
