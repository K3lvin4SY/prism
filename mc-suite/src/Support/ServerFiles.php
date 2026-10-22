<?php

declare(strict_types=1);

namespace McSuite\Support;

use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Daemon\FilesClient;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Wings file access for one server. Every path passes through normalize(), so nothing
 * outside the server's own data directory can be named, and a missing file reads as null.
 */
final class ServerFiles
{
    private ?FilesClient $client = null;

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    /**
     * A clean relative path: forward slashes, no leading slash, no `.` or `..` segments.
     */
    public static function normalize(string $path): string
    {
        abort_if(str_contains($path, "\0"), 422, 'Invalid path.');

        $segments = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            abort_if($segment === '..', 422, 'Invalid path.');
            $segments[] = $segment;
        }

        return implode('/', $segments);
    }

    public static function join(string ...$parts): string
    {
        return self::normalize(implode('/', $parts));
    }

    public function read(string $path, ?int $maxBytes = null): ?string
    {
        try {
            return $this->client()->getContent('/'.self::normalize($path), $maxBytes);
        } catch (DaemonConnectionException $exception) {
            // Some Wings versions answer a missing file with a 500, so check the directory before failing.
            if ($this->isMissing($exception) || $this->size($path) === null) {
                return null;
            }

            throw $exception;
        }
    }

    /** @return array<mixed>|null */
    public function readJson(string $path, ?int $maxBytes = 4_000_000): ?array
    {
        $content = $this->read($path, $maxBytes);
        if ($content === null) {
            return null;
        }

        $decoded = json_decode($content, true);

        return is_array($decoded) ? $decoded : null;
    }

    public function write(string $path, string $content): void
    {
        $this->client()->putContent('/'.self::normalize($path), $content);
    }

    public function writeJson(string $path, mixed $value): void
    {
        $this->write($path, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
    }

    /**
     * Directory entries keyed by name, or an empty list when the directory does not exist.
     *
     * @return array<string, array{name: string, file: bool, size: int, modified: string|null}>
     */
    public function list(string $directory): array
    {
        try {
            $entries = $this->client()->getDirectory('/'.self::normalize($directory));
        } catch (DaemonConnectionException $exception) {
            // As with files, some Wings versions answer a missing directory with a 500.
            if ($this->isMissing($exception) || ! $this->directoryExists($directory)) {
                return [];
            }

            throw $exception;
        }

        $result = [];
        foreach ($entries as $entry) {
            $name = (string) ($entry['name'] ?? '');
            if ($name === '') {
                continue;
            }

            $result[$name] = [
                'name' => $name,
                'file' => (bool) ($entry['file'] ?? true),
                'size' => (int) ($entry['size'] ?? 0),
                'modified' => isset($entry['modified']) ? (string) $entry['modified'] : null,
            ];
        }

        return $result;
    }

    /** @param list<string> $files names relative to $directory */
    public function delete(string $directory, array $files): void
    {
        if ($files === []) {
            return;
        }

        $this->client()->deleteFiles('/'.self::normalize($directory), array_map(self::normalize(...), $files));
    }

    public function rename(string $directory, string $from, string $to): void
    {
        $this->client()->renameFiles('/'.self::normalize($directory), [[
            'from' => self::normalize($from),
            'to' => self::normalize($to),
        ]]);
    }

    /**
     * Creates a directory and any missing parents.
     */
    public function makeDirectory(string $path): void
    {
        $path = self::normalize($path);
        if ($path === '') {
            return;
        }

        $parent = '';
        foreach (explode('/', $path) as $segment) {
            if (! array_key_exists($segment, $this->list($parent))) {
                $this->client()->createDirectory($segment, '/'.$parent);
            }

            $parent = $parent === '' ? $segment : $parent.'/'.$segment;
        }
    }

    /**
     * Starts a background download on Wings. Callers poll the target's size to see it finish.
     */
    public function pull(string $url, string $directory, string $filename): void
    {
        $this->client()->pull(self::resolveGitHub($url), '/'.self::normalize($directory), ['filename' => self::normalize($filename)]);
    }

    /**
     * GitHub release downloads redirect to a signed link on another host, which Wings does not
     * follow. The link is looked up here and handed to Wings instead; it stays valid for a few
     * minutes, and the download starts at once.
     */
    private static function resolveGitHub(string $url): string
    {
        if (parse_url($url, PHP_URL_HOST) !== 'github.com' || ! str_contains($url, '/releases/download/')) {
            return $url;
        }

        $location = Http::withUserAgent(McJars::USER_AGENT)->withoutRedirecting()->timeout(15)->head($url)->header('Location');

        return is_string($location) && str_starts_with($location, 'https://') ? $location : $url;
    }

    public function decompress(string $directory, string $file): void
    {
        $this->client()->decompressFile('/'.self::normalize($directory), self::normalize($file));
    }

    /** The size of a file, or null when it does not exist. */
    public function size(string $path): ?int
    {
        $path = self::normalize($path);
        $directory = str_contains($path, '/') ? dirname($path) : '';
        $entry = $this->list($directory)[basename($path)] ?? null;

        return $entry === null ? null : $entry['size'];
    }

    private function directoryExists(string $directory): bool
    {
        $directory = self::normalize($directory);
        if ($directory === '') {
            return true;
        }

        $parent = str_contains($directory, '/') ? dirname($directory) : '';
        $entry = $this->list($parent)[basename($directory)] ?? null;

        return $entry !== null && ! $entry['file'];
    }

    private function client(): FilesClient
    {
        return $this->client ??= Daemon::server($this->server)->files();
    }

    private function isMissing(DaemonConnectionException $exception): bool
    {
        return $exception instanceof HttpException && $exception->getStatusCode() === 404;
    }
}
