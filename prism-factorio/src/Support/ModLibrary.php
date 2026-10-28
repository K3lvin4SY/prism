<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Pterodactyl\Models\Server;

/**
 * The mods on one server: the zips (and unpacked folders) in mods/, whether each is on in
 * mods/mod-list.json, and what the Panel recorded when it installed them. The game's own mods
 * (base and the expansion) are in data/ and only appear in mod-list.json.
 *
 * Records are per-server settings `mod.<name>`.
 */
final class ModLibrary
{
    public const string FOLDER = 'mods';

    public const string LIST = 'mods/mod-list.json';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function key(string $name): string
    {
        return 'mod.'.$name;
    }

    /** @return array<string, array<string, mixed>> keyed by mod name */
    public function records(): array
    {
        $records = [];
        foreach (Settings::server($this->server)->getByPrefix('mod.') as $value) {
            if (is_array($value) && isset($value['name'])) {
                $records[(string) $value['name']] = $value;
            }
        }

        return $records;
    }

    /**
     * The mods in the mods folder, by name: name_1.2.3.zip, or an unpacked folder.
     *
     * @return array<string, array{name: string, version: string|null, files: list<string>}>
     */
    public function files(): array
    {
        $mods = [];
        foreach (ServerFiles::for($this->server)->list(self::FOLDER) as $entry => $file) {
            if ($file['file'] && preg_match('/^(.+)_(\d+\.\d+\.\d+)\.zip$/', $entry, $match)) {
                [$name, $version] = [$match[1], $match[2]];
            } elseif (! $file['file'] && preg_match('/^(.+?)(?:_(\d+\.\d+\.\d+))?$/', $entry, $match)) {
                [$name, $version] = [$match[1], $match[2] ?? null];
            } else {
                continue;
            }

            $mods[$name] ??= ['name' => $name, 'version' => null, 'files' => []];
            $mods[$name]['files'][] = $entry;
            // With several versions, the game loads the newest.
            if ($version !== null && ($mods[$name]['version'] === null || version_compare($version, $mods[$name]['version'], '>'))) {
                $mods[$name]['version'] = $version;
            }
        }

        return $mods;
    }

    /** @return array<string, bool> mod name => on, from mod-list.json */
    public function states(): array
    {
        $list = ServerFiles::for($this->server)->readJson(self::LIST);
        $states = [];
        foreach ($list['mods'] ?? [] as $mod) {
            if (is_array($mod) && isset($mod['name'])) {
                $states[(string) $mod['name']] = (bool) ($mod['enabled'] ?? true);
            }
        }

        return $states;
    }

    /**
     * mod-list.json with these mods switched on or off, and those set to null taken out. The
     * game adds mods it finds that are not listed, switched on, and keeps the list's order.
     *
     * @param  array<string, bool|null>  $changes
     */
    public function modList(array $changes): string
    {
        $list = ServerFiles::for($this->server)->readJson(self::LIST) ?? ['mods' => [['name' => 'base', 'enabled' => true]]];
        $mods = [];
        foreach ($list['mods'] ?? [] as $mod) {
            if (is_array($mod) && isset($mod['name'])) {
                $mods[(string) $mod['name']] = $mod;
            }
        }
        foreach ($changes as $name => $enabled) {
            if ($enabled === null) {
                unset($mods[$name]);
            } else {
                $mods[$name] = [...($mods[$name] ?? []), 'name' => $name, 'enabled' => $enabled];
            }
        }
        $list['mods'] = array_values($mods);

        return json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
    }
}
