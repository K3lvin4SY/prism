<?php

declare(strict_types=1);

namespace PrismFiles\Support;

use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Hidden and protected paths from the admin settings, one pattern per line:
 *   /config/secret.yml   one file, from the server's root
 *   /world/              a folder and everything in it
 *   *.log                any file with that name, in any folder
 *   plugins/*.jar        a pattern below any folder
 */
final class Paths
{
    public static function setting(string $key, mixed $default = null): mixed
    {
        try {
            return app(ExtensionSettingsRegistry::class)->get('prism-files')?->get($key) ?? $default;
        } catch (Throwable) {
            return $default;
        }
    }

    /** @return list<string> */
    public static function patterns(string $key): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\R/', (string) self::setting($key, '')) ?: []), static fn (string $line): bool => $line !== '' && ! str_starts_with($line, '#')));
    }

    public static function regex(string $pattern): string
    {
        $anchored = str_starts_with($pattern, '/');
        $glob = trim($pattern, '/');
        $body = '';
        for ($i = 0, $length = strlen($glob); $i < $length; $i++) {
            $char = $glob[$i];
            if ($char === '*' && ($glob[$i + 1] ?? '') === '*') {
                $body .= '.*';
                $i++;
            } elseif ($char === '*') {
                $body .= '[^/]*';
            } elseif ($char === '?') {
                $body .= '[^/]';
            } else {
                $body .= preg_quote($char, '#');
            }
        }

        return '#'.($anchored ? '^/' : '(^|/)').$body.'(/.*)?$#';
    }

    /** Whether the path, or anything inside it, matches one of the patterns. */
    public static function matches(string $path, array $patterns, bool $includeChildren = true): bool
    {
        $path = '/'.ServerFiles::normalize($path);
        foreach ($patterns as $pattern) {
            if (preg_match(self::regex($pattern), $path) === 1) {
                return true;
            }

            // Moving or deleting a folder also moves or deletes what is protected inside it.
            if ($includeChildren && str_starts_with($pattern, '/') && str_starts_with(rtrim($pattern, '/').'/', rtrim($path, '/').'/') && $path !== '/') {
                return true;
            }
        }

        return false;
    }

    /** Stops the request when the user may not change the path. */
    public static function guard(User $user, Server $server, string ...$paths): void
    {
        if ($user->root_admin && ! (bool) self::setting('protect_admins', false)) {
            return;
        }

        $patterns = self::patterns('protected_paths');
        if ($patterns === []) {
            return;
        }

        foreach ($paths as $path) {
            abort_if(self::matches($path, $patterns), 403, sprintf('%s is protected, so it cannot be changed here.', '/'.ServerFiles::normalize($path)));
        }
    }
}
