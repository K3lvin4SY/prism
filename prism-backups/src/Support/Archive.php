<?php

declare(strict_types=1);

namespace PrismBackups\Support;

/**
 * A backup archive downloaded to the panel, and what is in it. Wings cannot list or extract
 * single files from a backup, so the panel fetches the .tar.gz once and keeps it for a while.
 */
final class Archive
{
    public function __construct(public readonly string $uuid) {}

    public static function for(string $uuid): self
    {
        abort_unless(preg_match('/^[0-9a-f-]{36}$/', $uuid) === 1, 422, 'Invalid backup.');

        return new self($uuid);
    }

    public function path(): string
    {
        return Settings::storage('cache').'/'.$this->uuid.'.tar.gz';
    }

    public function partial(): string
    {
        return $this->path().'.part';
    }

    public function listingPath(): string
    {
        return Settings::storage('cache').'/'.$this->uuid.'.json';
    }

    public function downloaded(): bool
    {
        clearstatcache(true, $this->path());

        return is_file($this->path());
    }

    public function listed(): bool
    {
        clearstatcache(true, $this->listingPath());

        return is_file($this->listingPath());
    }

    /** Opening a backup again keeps it on the panel for longer. */
    public function touch(): void
    {
        foreach ([$this->path(), $this->listingPath()] as $file) {
            if (is_file($file)) {
                @touch($file);
            }
        }
    }

    /**
     * Downloads the archive from a signed link. The link goes in a config file only curl reads,
     * so it does not show in the process list.
     */
    public function startDownload(string $url): int
    {
        $config = $this->partial().'.curl';
        file_put_contents($config, 'url = "'.addcslashes($url, '"\\').'"'."\n");
        chmod($config, 0600);
        @unlink($this->partial());

        return Background::start(sprintf(
            'curl -fsSL --retry 2 --connect-timeout 20 --max-time 21600 -K %1$s -o %2$s 2> %3$s; code=$?; rm -f %1$s; exit $code',
            escapeshellarg($config),
            escapeshellarg($this->partial()),
            escapeshellarg($this->partial().'.err'),
        ), $this->partial().'.code');
    }

    public function downloadedBytes(): int
    {
        clearstatcache(true, $this->partial());

        return is_file($this->partial()) ? (int) filesize($this->partial()) : 0;
    }

    /** @return array{done: bool, error: string|null} */
    public function downloadState(): array
    {
        $code = Background::code($this->partial().'.code');
        if ($code === null) {
            return ['done' => false, 'error' => null];
        }

        if ($code !== 0) {
            return ['done' => true, 'error' => 'The download from the node failed: '.(Background::error($this->partial().'.err') ?: 'curl exited with '.$code.'.')];
        }

        rename($this->partial(), $this->path());
        $this->cleanup($this->partial());

        return ['done' => true, 'error' => null];
    }

    public function startListing(): int
    {
        $list = $this->listingPath().'.txt';

        return Background::start(sprintf(
            'tar --list --verbose --gzip --quoting-style=literal --file %s > %s 2> %s',
            escapeshellarg($this->path()),
            escapeshellarg($list),
            escapeshellarg($list.'.err'),
        ), $list.'.code');
    }

    /** @return array{done: bool, error: string|null} */
    public function listingState(): array
    {
        $list = $this->listingPath().'.txt';
        $code = Background::code($list.'.code');
        if ($code === null) {
            return ['done' => false, 'error' => null];
        }

        if ($code !== 0) {
            $error = Background::error($list.'.err');
            $this->cleanup($list);

            return ['done' => true, 'error' => 'The backup could not be read: '.($error ?: 'tar exited with '.$code.'.')];
        }

        $entries = self::parse((string) file_get_contents($list));
        file_put_contents($this->listingPath(), json_encode($entries, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $this->cleanup($list);

        return ['done' => true, 'error' => null];
    }

    /**
     * Entries from `tar --list --verbose`: path, size, folder or not, and modified time. The
     * name as stored in the archive is kept in `r` when it differs from the clean path.
     *
     * @return list<array{p: string, s: int, d: bool, t: string, r?: string}>
     */
    public static function parse(string $listing): array
    {
        $entries = [];
        foreach (explode("\n", $listing) as $line) {
            if (preg_match('/^(\S)\S*\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)\s(.*)$/', $line, $match) !== 1) {
                continue;
            }

            [, $type, $size, $time, $name] = $match;
            if ($type === 'l') {
                $name = explode(' -> ', $name, 2)[0];
            } elseif ($type === 'h') {
                $name = explode(' link to ', $name, 2)[0];
            }

            $path = trim(preg_replace('#^(\./)+#', '', $name) ?? $name, '/');
            if ($path === '' || $path === '.') {
                continue;
            }

            $entry = ['p' => $path, 's' => (int) $size, 'd' => $type === 'd', 't' => $time];
            if ($name !== $path) {
                $entry['r'] = $name;
            }

            $entries[] = $entry;
        }

        return $entries;
    }

    /** @return list<array{p: string, s: int, d: bool, t: string, r?: string}> */
    public function entries(): array
    {
        $decoded = json_decode((string) @file_get_contents($this->listingPath()), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Extracts the named members into a folder in the background.
     *
     * @param  list<string>  $members names as stored in the archive
     */
    public function startExtract(array $members, string $into): int
    {
        if (! is_dir($into)) {
            mkdir($into, 0750, true);
        }

        $list = $into.'.members';
        file_put_contents($list, implode("\n", $members)."\n");

        return Background::start(sprintf(
            'tar --extract --gzip --file %s --directory %s --no-same-owner --no-same-permissions --no-wildcards --verbatim-files-from --files-from %s 2> %s',
            escapeshellarg($this->path()),
            escapeshellarg($into),
            escapeshellarg($list),
            escapeshellarg($into.'.err'),
        ), $into.'.code');
    }

    public function delete(): void
    {
        foreach ([$this->path(), $this->listingPath()] as $file) {
            @unlink($file);
        }

        $this->cleanup($this->partial());
        $this->cleanup($this->listingPath().'.txt');
    }

    private function cleanup(string $base): void
    {
        foreach (['', '.code', '.err', '.curl'] as $suffix) {
            if ($base.$suffix !== $this->path() && $base.$suffix !== $this->listingPath()) {
                @unlink($base.$suffix);
            }
        }
    }
}
