<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Factorio's headless server releases: the current stable and experimental versions from
 * factorio.com, and every version there is from the updater's upgrade list. The egg downloads
 * whichever its FACTORIO_VERSION variable names ("latest", "experimental" or a version).
 */
final class Releases
{
    /**
     * @return array{stable: string|null, experimental: string|null, versions: list<string>}
     */
    public static function all(): array
    {
        return Cache::remember('ext:prism-factorio:releases', 3600, static function (): array {
            $latest = self::get('https://factorio.com/api/latest-releases');
            $stable = is_string($latest['stable']['headless'] ?? null) ? $latest['stable']['headless'] : null;
            $experimental = is_string($latest['experimental']['headless'] ?? null) ? $latest['experimental']['headless'] : null;

            $versions = [];
            foreach (self::get('https://updater.factorio.com/get-available-versions')['core-linux_headless64'] ?? [] as $step) {
                foreach (['from', 'to', 'stable', 'experimental'] as $key) {
                    if (is_string($step[$key] ?? null) && preg_match('/^\d+\.\d+\.\d+$/', $step[$key])) {
                        $versions[$step[$key]] = true;
                    }
                }
            }
            foreach ([$stable, $experimental] as $version) {
                if ($version !== null) {
                    $versions[$version] = true;
                }
            }

            $versions = array_map('strval', array_keys($versions));
            usort($versions, static fn (string $a, string $b): int => version_compare($b, $a));

            return ['stable' => $stable, 'experimental' => $experimental, 'versions' => $versions];
        });
    }

    /** @return array<mixed> */
    private static function get(string $url): array
    {
        try {
            $response = Http::withUserAgent(Settings::USER_AGENT)->acceptJson()->timeout(15)->get($url);

            return $response->successful() ? (array) $response->json() : [];
        } catch (Throwable) {
            return [];
        }
    }
}
