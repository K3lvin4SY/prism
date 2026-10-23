<?php

declare(strict_types=1);

namespace PrismMc\Support;

use GuzzleHttp\Psr7\Utils;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Daemon\DaemonConnection;
use RuntimeException;

/**
 * Downloads that Wings cannot make itself (minecraft.net refuses non-browser clients) are
 * fetched by the Panel and written to the server through Wings' own file API. Wings never has
 * to reach the Panel, which matters where it blocks addresses it considers internal.
 */
final class Relay
{
    private const string BROWSER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    private const int MAX_BYTES = 400 * 1024 * 1024;

    private const int TTL = 3600;

    private const int UPLOAD_TIMEOUT = 70;

    /** Hosts the relay will fetch from. */
    private const array HOSTS = ['www.minecraft.net', 'minecraft.net'];

    public static function directory(): string
    {
        return storage_path('app/prism-mc-relay');
    }

    /**
     * Fetches the file into Panel storage and returns where it is.
     *
     * @return array{file: string, size: int}
     */
    public static function fetch(string $url, string $jobId): array
    {
        $host = parse_url($url, PHP_URL_HOST);
        throw_unless(str_starts_with($url, 'https://') && in_array($host, self::HOSTS, true), RuntimeException::class, 'This download cannot be relayed.');

        self::prune();
        if (! is_dir(self::directory())) {
            mkdir(self::directory(), 0700, true);
        }

        $file = 'relay-'.preg_replace('/[^A-Za-z0-9-]/', '', $jobId).'.bin';
        $path = self::directory().'/'.$file;

        $response = Http::withUserAgent(self::BROWSER_AGENT)
            ->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])
            ->timeout(60)
            ->sink($path)
            ->get($url);

        if (! $response->successful() || ! is_file($path) || filesize($path) === 0 || filesize($path) > self::MAX_BYTES) {
            @unlink($path);
            throw new RuntimeException('The download from '.$host.' failed ('.$response->status().').');
        }

        return ['file' => $file, 'size' => (int) filesize($path)];
    }

    /**
     * Writes a fetched file to the server, then removes the Panel's copy.
     */
    public static function upload(Server $server, string $file, string $target): void
    {
        $path = self::directory().'/'.basename($file);
        throw_unless(is_file($path), RuntimeException::class, 'The downloaded file is gone.');

        // Streamed from disk: the archive is larger than PHP's memory limit allows reading in one go.
        $stream = Utils::streamFor(fopen($path, 'rb'));
        try {
            DaemonConnection::forNode($server->node)->request('POST', "/api/servers/{$server->uuid}/files/write", [
                'query' => ['file' => '/'.ServerFiles::normalize($target)],
                'body' => $stream,
                'timeout' => self::UPLOAD_TIMEOUT,
            ]);
        } finally {
            $stream->close();
        }

        @unlink($path);
    }

    /** Removes relayed files left behind by failed installs. */
    private static function prune(): void
    {
        foreach (glob(self::directory().'/*') ?: [] as $file) {
            if (is_file($file) && filemtime($file) < time() - self::TTL) {
                @unlink($file);
            }
        }
    }
}
