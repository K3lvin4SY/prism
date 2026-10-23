<?php

declare(strict_types=1);

namespace PrismFiles\Support;

use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;

/**
 * The trash bin: deleting moves a file into .prism-trash/<id>/ with one rename on the node,
 * and .prism-trash/index.json remembers where it came from. Nothing is copied.
 */
final class Trash
{
    public const string FOLDER = '.prism-trash';

    private const string INDEX = self::FOLDER.'/index.json';

    private const string REGISTRY = 'trash.servers';

    public function __construct(private readonly Server $server, private readonly ServerFiles $files) {}

    public static function for(Server $server): self
    {
        return new self($server, ServerFiles::for($server));
    }

    /** @return list<array{id: string, path: string, name: string, size: int, directory: bool, deletedAt: string, by: string|null}> */
    public function items(): array
    {
        $index = $this->files->readJson(self::INDEX);

        return array_values(array_filter(is_array($index['items'] ?? null) ? $index['items'] : [], static fn ($item): bool => is_array($item) && isset($item['id'], $item['path'])));
    }

    /** @param list<array<string, mixed>> $items */
    private function save(array $items): void
    {
        $this->files->writeJson(self::INDEX, ['items' => array_values($items)]);
    }

    /**
     * @param  list<string>  $names  names in $directory
     * @return list<array<string, mixed>> the new trash entries
     */
    public function put(string $directory, array $names, ?string $by): array
    {
        $directory = ServerFiles::normalize($directory);
        $listing = $this->files->list($directory);
        $items = $this->items();
        $added = [];

        foreach ($names as $name) {
            $name = ServerFiles::normalize($name);
            $path = ServerFiles::join($directory, $name);
            abort_if($path === '' || $path === self::FOLDER || str_starts_with($path, self::FOLDER.'/'), 422, 'The trash cannot be put in the trash.');

            $entry = $listing[basename($name)] ?? null;
            if ($entry === null && dirname($name) === '.') {
                continue;
            }

            $id = Str::lower(Str::random(12));
            $this->files->makeDirectory(self::FOLDER.'/'.$id);
            $this->files->rename('', $path, self::FOLDER.'/'.$id.'/'.basename($name));

            $added[] = $items[] = [
                'id' => $id,
                'path' => '/'.$path,
                'name' => basename($name),
                'size' => (int) ($entry['size'] ?? 0),
                'directory' => $entry !== null && ! $entry['file'],
                'deletedAt' => now()->toAtomString(),
                'by' => $by,
            ];
        }

        $this->save($items);
        $this->register();

        return $added;
    }

    /**
     * Puts items back where they were. With something already in the way, `replace`
     * overwrites it, `rename` restores beside it with a new name, and `skip` leaves the item.
     *
     * @param  list<string>  $ids
     * @return array{restored: list<string>, conflicts: list<string>}
     */
    public function restore(array $ids, string $conflict): array
    {
        $items = $this->items();
        $restored = [];
        $conflicts = [];

        foreach ($items as $index => $item) {
            if (! in_array($item['id'], $ids, true)) {
                continue;
            }

            $target = ServerFiles::normalize($item['path']);
            $parent = dirname($target) === '.' ? '' : dirname($target);
            $existing = $this->files->list($parent);

            if (isset($existing[basename($target)])) {
                if ($conflict === 'skip') {
                    $conflicts[] = $item['path'];

                    continue;
                }

                if ($conflict === 'replace') {
                    $this->files->delete($parent, [basename($target)]);
                } else {
                    $target = $this->freeName($parent, basename($target), $existing);
                }
            }

            $this->files->makeDirectory($parent);
            $this->files->rename('', self::FOLDER.'/'.$item['id'].'/'.$item['name'], $target);
            $this->files->delete(self::FOLDER, [$item['id']]);
            $restored[] = '/'.$target;
            unset($items[$index]);
        }

        $this->save($items);

        return ['restored' => $restored, 'conflicts' => $conflicts];
    }

    /** @param list<string> $ids */
    public function purge(array $ids): int
    {
        $items = $this->items();
        $remove = array_values(array_filter($items, static fn (array $item): bool => in_array($item['id'], $ids, true)));
        $this->files->delete(self::FOLDER, array_column($remove, 'id'));
        $this->save(array_filter($items, static fn (array $item): bool => ! in_array($item['id'], $ids, true)));

        return count($remove);
    }

    public function empty(): int
    {
        $items = $this->items();
        $folders = array_values(array_filter(array_keys($this->files->list(self::FOLDER)), static fn (string $name): bool => $name !== 'index.json'));
        $this->files->delete(self::FOLDER, $folders);
        $this->save([]);

        return count($items);
    }

    /** Deletes for good what has been in the trash longer than the admin allows. */
    public function expire(int $days): int
    {
        $cutoff = now()->subDays($days);
        $old = array_column(array_filter($this->items(), static fn (array $item): bool => strtotime((string) $item['deletedAt']) < $cutoff->getTimestamp()), 'id');

        return $old === [] ? 0 : $this->purge($old);
    }

    /** Adds the trash to .pteroignore, so backups leave it out. */
    public function ignoreInBackups(): bool
    {
        $current = (string) $this->files->read('.pteroignore', 1_000_000);
        $lines = array_map('trim', preg_split('/\R/', $current) ?: []);
        if (in_array(self::FOLDER, $lines, true) || in_array('/'.self::FOLDER, $lines, true)) {
            return false;
        }

        $this->files->write('.pteroignore', rtrim($current)."\n".self::FOLDER."\n");

        return true;
    }

    public function ignoredInBackups(): bool
    {
        $lines = array_map('trim', preg_split('/\R/', (string) $this->files->read('.pteroignore', 1_000_000)) ?: []);

        return in_array(self::FOLDER, $lines, true) || in_array('/'.self::FOLDER, $lines, true);
    }

    /** @param array<string, mixed> $existing */
    private function freeName(string $parent, string $name, array $existing): string
    {
        $dot = strrpos($name, '.');
        [$base, $extension] = $dot > 0 ? [substr($name, 0, $dot), substr($name, $dot)] : [$name, ''];
        for ($i = 1; $i < 1000; $i++) {
            $candidate = sprintf('%s (restored%s)%s', $base, $i > 1 ? ' '.$i : '', $extension);
            if (! isset($existing[$candidate])) {
                return ServerFiles::join($parent, $candidate);
            }
        }

        abort(409, 'Could not find a free name to restore '.$name.' to.');
    }

    /** Remembers the server, so the daily clean-up visits it. */
    private function register(): void
    {
        $store = new ExtensionSettings('prism-files');
        $servers = $store->get(self::REGISTRY, []);
        if (! in_array($this->server->id, $servers, true)) {
            $store->set(self::REGISTRY, [...$servers, $this->server->id]);
        }
    }

    /** @return list<int> */
    public static function registered(): array
    {
        $servers = (new ExtensionSettings('prism-files'))->get(self::REGISTRY, []);

        return array_values(array_filter(is_array($servers) ? $servers : [], 'is_int'));
    }

    /** @param list<int> $servers */
    public static function setRegistered(array $servers): void
    {
        (new ExtensionSettings('prism-files'))->set(self::REGISTRY, array_values($servers));
    }
}
