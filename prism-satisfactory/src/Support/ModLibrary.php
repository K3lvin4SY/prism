<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Pterodactyl\Models\Server;
use Throwable;

/**
 * The mods on one server: a folder each in FactoryGame/Mods (turned-off ones in .sfy/disabled),
 * named by the mod reference and holding <reference>.uplugin, joined with what the Panel recorded
 * when it installed them.
 *
 * Records are per-server settings `mod.<reference>`.
 */
final class ModLibrary
{
    public const string FOLDER = 'FactoryGame/Mods';

    public const string DISABLED = '.sfy/disabled';

    /** Where a mod's old folder waits while its update is installed. */
    public const string PREVIOUS = '.sfy/previous';

    public const string DOWNLOADS = '.sfy/downloads';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function key(string $reference): string
    {
        return 'mod.'.$reference;
    }

    /** @return array<string, array<string, mixed>> keyed by mod reference */
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
     * The mod folders, with the name and version from each one's .uplugin.
     *
     * @return array<string, array{folder: string, enabled: bool, title: string|null, version: string|null, plugin: bool}>
     */
    public function folders(): array
    {
        $files = ServerFiles::for($this->server);
        $folders = [];
        foreach ([self::FOLDER => true, self::DISABLED => false] as $directory => $enabled) {
            try {
                $entries = $files->list($directory);
            } catch (Throwable) {
                continue;
            }

            foreach ($entries as $name => $entry) {
                if ($entry['file'] || count($folders) >= 100) {
                    continue;
                }
                $plugin = $files->readJson(ServerFiles::join($directory, $name, $name.'.uplugin'), 500_000);
                $folders[$name] = [
                    'folder' => $name,
                    'enabled' => $enabled,
                    'title' => isset($plugin['FriendlyName']) ? (string) $plugin['FriendlyName'] : null,
                    'version' => isset($plugin['SemVersion']) ? (string) $plugin['SemVersion'] : (isset($plugin['VersionName']) ? (string) $plugin['VersionName'] : null),
                    'plugin' => $plugin !== null,
                ];
            }
        }

        return $folders;
    }
}
