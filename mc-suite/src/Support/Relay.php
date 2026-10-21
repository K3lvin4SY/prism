<?php

declare(strict_types=1);

namespace McSuite\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Downloads that Wings cannot make itself (minecraft.net refuses non-browser clients) are
 * fetched by the Panel and handed to Wings through a short-lived signed link.
 */
final class Relay
{
    private const string BROWSER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    private const int MAX_BYTES = 400 * 1024 * 1024;

    private const int TTL = 3600;

    /** Hosts the relay will fetch from. */
    private const array HOSTS = ['www.minecraft.net', 'minecraft.net'];

    public static function directory(): string
    {
        return storage_path('app/mc-suite-relay');
    }

    /**
     * Fetches the file to Panel storage and returns a signed link Wings can pull from.
     *
     * @return array{token: string, url: string, size: int}
     */
    public static function fetch(string $url, string $jobId): array
    {
        $host = parse_url($url, PHP_URL_HOST);
        throw_unless(str_starts_with($url, 'https://') && in_array($host, self::HOSTS, true), RuntimeException::class, 'This download cannot be relayed.');

        self::prune();
        $token = Str::random(48);
        $path = self::directory().'/'.$token;
        if (! is_dir(self::directory())) {
            mkdir(self::directory(), 0700, true);
        }

        $response = Http::withUserAgent(self::BROWSER_AGENT)
            ->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])
            ->timeout(60)
            ->sink($path)
            ->get($url);

        if (! $response->successful() || ! is_file($path) || filesize($path) === 0 || filesize($path) > self::MAX_BYTES) {
            @unlink($path);
            throw new RuntimeException('The download from '.$host.' failed ('.$response->status().').');
        }

        Cache::put('ext:mc-suite:relay:'.$token, ['job' => $jobId], self::TTL);

        return [
            'token' => $token,
            'url' => url()->temporarySignedRoute('extensions.mc-suite.web.relay', now()->addSeconds(self::TTL), ['token' => $token]),
            'size' => (int) filesize($path),
        ];
    }

    public static function path(string $token): ?string
    {
        if (! preg_match('/^[A-Za-z0-9]{48}$/', $token) || ! Cache::has('ext:mc-suite:relay:'.$token)) {
            return null;
        }

        $path = self::directory().'/'.$token;

        return is_file($path) ? $path : null;
    }

    public static function forget(string $token): void
    {
        Cache::forget('ext:mc-suite:relay:'.$token);
        if (preg_match('/^[A-Za-z0-9]{48}$/', $token)) {
            @unlink(self::directory().'/'.$token);
        }
    }

    /** Removes relayed files older than their link. */
    private static function prune(): void
    {
        foreach (glob(self::directory().'/*') ?: [] as $file) {
            if (is_file($file) && filemtime($file) < time() - self::TTL) {
                @unlink($file);
            }
        }
    }
}
