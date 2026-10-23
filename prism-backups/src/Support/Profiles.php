<?php

declare(strict_types=1);

namespace PrismBackups\Support;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Backup profiles: what a backup includes, turned into the ignore list Wings reads (gitignore
 * rules). The client has a twin of lines() for its preview, in src/client/patterns.ts.
 */
final class Profiles
{
    public const string MARKER = '/^\s*#\s*prism-backups:\s*profile=(.+?)\s*$/i';

    /** "No profile": only the server's .pteroignore, even when the server has a default profile. */
    public const string NONE = '/^\s*#\s*prism-backups:\s*none\s*$/i';

    /** The profile a "# prism-backups: profile=<name>" line names, if the list has one. */
    public static function marker(array $ignored): ?string
    {
        foreach ($ignored as $line) {
            if (is_string($line) && preg_match(self::MARKER, $line, $match) === 1) {
                return $match[1];
            }
        }

        return null;
    }

    /** @return list<string> the list without the marker line */
    public static function withoutMarker(array $ignored): array
    {
        return array_values(array_filter($ignored, static fn ($line): bool => is_string($line) && preg_match(self::MARKER, $line) !== 1));
    }

    public static function find(Server $server, string $name): ?object
    {
        return DB::table('prism_backup_profiles')->where('server_id', $server->id)->where('name', $name)->first();
    }

    public static function default(Server $server): ?object
    {
        return DB::table('prism_backup_profiles')->where('server_id', $server->id)->where('is_default', true)->first();
    }

    /** @return list<string> */
    public static function patterns(string $text): array
    {
        $lines = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
            $line = rtrim($line);
            if (mb_trim($line) !== '') {
                $lines[] = $line;
            }
        }

        return $lines;
    }

    /**
     * The ignore list for a profile. "Everything except" is its patterns, after the server's
     * .pteroignore when it asks for that. "Only what I pick" ignores everything, then takes back
     * each picked path, the folders above it and everything inside it.
     *
     * @return list<string>
     */
    public static function lines(object $profile, Server $server): array
    {
        $patterns = self::patterns((string) $profile->patterns);

        if ($profile->mode === 'include') {
            return self::includeLines($patterns);
        }

        return $profile->apply_pteroignore ? [...self::pteroignore($server), ...$patterns] : $patterns;
    }

    /** @return list<string> the server's .pteroignore, one pattern a line */
    public static function pteroignore(Server $server): array
    {
        try {
            return self::patterns((string) ServerFiles::for($server)->read('.pteroignore', 1_000_000));
        } catch (Throwable) {
            return [];
        }
    }

    /**
     * @param  list<string>  $picked
     * @return list<string>
     */
    public static function includeLines(array $picked): array
    {
        $lines = ['*'];
        foreach ($picked as $path) {
            $path = trim(str_replace('\\', '/', $path), '/ ');
            if ($path === '' || str_starts_with($path, '#')) {
                continue;
            }

            $segments = explode('/', $path);
            for ($index = 1; $index < count($segments); $index++) {
                $lines[] = '!/'.implode('/', array_slice($segments, 0, $index)).'/';
            }

            $lines[] = '!/'.$path;
            $lines[] = '!/'.$path.'/**';
        }

        return array_values(array_unique($lines));
    }

    /** Remembers the profile a backup was made with. */
    public static function remember(Server $server, string $backupUuid, string $profile): void
    {
        DB::table('prism_backup_meta')->updateOrInsert(['backup_uuid' => $backupUuid], ['server_id' => $server->id, 'profile' => $profile, 'created_at' => now(), 'updated_at' => now()]);
    }
}
