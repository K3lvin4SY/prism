<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * The mods on one server: the folders in the mods folder, each read from its ModManifest.json,
 * joined with what the Panel recorded when it installed them (source, id, version).
 *
 * Records are per-server settings `mod.<source>.<id>`; a Workshop mod's folder is known once
 * the start step has downloaded it (.cks/installed.txt).
 */
final class ModLibrary
{
    public const string DISABLED = '.cks/disabled';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function key(string $id): string
    {
        return 'mod.'.str_replace(':', '.', $id);
    }

    /** @return array<string, array<string, mixed>> keyed by "source:id" */
    public function records(): array
    {
        $records = [];
        foreach (Settings::server($this->server)->getByPrefix('mod.') as $value) {
            if (is_array($value) && isset($value['id'])) {
                $records[(string) $value['id']] = $value;
            }
        }

        return $records;
    }

    /** @return array<string, array<string, mixed>> Workshop records keyed by Workshop id */
    public function workshop(): array
    {
        $wanted = [];
        foreach ($this->records() as $record) {
            if (($record['source'] ?? null) === 'steam') {
                $wanted[(string) $record['sourceId']] = $record;
            }
        }

        return $wanted;
    }

    /** @return array<string, array{updated: int, folder: string}> what the start step downloaded, by Workshop id */
    public function downloaded(): array
    {
        $done = [];
        foreach (explode("\n", ServerFiles::for($this->server)->read('.cks/installed.txt') ?? '') as $line) {
            if (preg_match('/^(\d+) (\d+) (\S.*)$/', trim($line), $match)) {
                $done[$match[1]] = ['updated' => (int) $match[2], 'folder' => $match[3]];
            }
        }

        return $done;
    }

    /**
     * Mod folders, enabled ones in the mods folder and turned-off ones in .cks/disabled.
     *
     * @return array<string, array<string, mixed>> keyed by folder name
     */
    public function folders(): array
    {
        $files = ServerFiles::for($this->server);
        $folders = [];
        foreach ([StartHook::MODS => true, self::DISABLED => false] as $directory => $enabled) {
            try {
                $entries = $files->list($directory);
            } catch (Throwable) {
                continue;
            }

            foreach ($entries as $name => $entry) {
                if ($entry['file'] || count($folders) >= 100) {
                    continue;
                }

                $path = ServerFiles::join($directory, $name);
                $manifest = $files->readJson(ServerFiles::join($path, 'ModManifest.json'), 1_000_000);
                $paths = array_map(static fn ($file): string => is_array($file) ? (string) ($file['path'] ?? '') : '', $manifest['files'] ?? []);
                $bundles = array_values(array_filter($paths, static fn (string $file): bool => str_ends_with($file, '.assetbundle')));

                $folders[$name] = [
                    'folder' => $name,
                    'enabled' => $enabled,
                    'manifest' => $manifest !== null,
                    'name' => isset($manifest['name']) ? (string) $manifest['name'] : null,
                    'displayName' => isset($manifest['displayName']) ? (string) $manifest['displayName'] : null,
                    'guid' => isset($manifest['guid']) ? (string) $manifest['guid'] : null,
                    // Core Keeper's ModManifest: 1 client, 2 server, 3 both.
                    'requiredOn' => isset($manifest['requiredOn']) ? (int) $manifest['requiredOn'] : null,
                    // The Linux server only loads Linux asset bundles; script-only mods have none.
                    'linux' => $bundles === [] || array_filter($bundles, static fn (string $file): bool => str_contains(strtolower($file), 'linux')) !== [],
                    'scripts' => array_filter($paths, static fn (string $file): bool => str_ends_with($file, '.cs')) !== [],
                ];
            }
        }

        return $folders;
    }

    /** A free folder name for a mod, from its title. */
    public function folderFor(string $title, ?string $current = null): string
    {
        if ($current !== null && $current !== '') {
            return $current;
        }

        $base = trim((string) preg_replace('/[^A-Za-z0-9._-]+/', '', str_replace(' ', '', $title)), '.-') ?: 'Mod';
        $taken = array_keys($this->folders());
        foreach ($this->records() as $record) {
            if (isset($record['folder'])) {
                $taken[] = (string) $record['folder'];
            }
        }

        $name = $base;
        for ($i = 2; in_array($name, $taken, true); $i++) {
            $name = $base.$i;
        }

        return $name;
    }
}
