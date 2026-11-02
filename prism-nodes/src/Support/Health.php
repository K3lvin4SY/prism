<?php

declare(strict_types=1);

namespace PrismNodes\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PrismNodes\Models\Sample;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Throwable;

/** What the Node health page knows about a node: Wings, the host, and what its servers use. */
final class Health
{
    /** Hours of history the graphs show. */
    public const int GRAPH_HOURS = 24;

    /** Days samples are kept. */
    public const int KEEP_DAYS = 7;

    /**
     * Wings' own report of the host, asked at most once a minute per node. Wings 1.12 and newer
     * answer the fuller v2; older ones the short form.
     *
     * @return array{online: bool, error: string|null, version: string|null, os: string|null, kernel: string|null, architecture: string|null, cpu_threads: int|null, memory_bytes: int|null, docker: string|null, containers: array{running: int, total: int}|null}
     */
    public static function system(Node $node): array
    {
        return Cache::remember("prism-nodes:system:{$node->id}", 60, static function () use ($node): array {
            try {
                $info = Daemon::node($node)->systemInformation(2);
                if (isset($info['system'])) {
                    return [
                        'online' => true,
                        'error' => null,
                        'version' => self::text($info['version'] ?? null),
                        'os' => self::text($info['system']['os'] ?? null),
                        'kernel' => self::text($info['system']['kernel_version'] ?? null),
                        'architecture' => self::text($info['system']['architecture'] ?? null),
                        'cpu_threads' => isset($info['system']['cpu_threads']) ? (int) $info['system']['cpu_threads'] : null,
                        'memory_bytes' => isset($info['system']['memory_bytes']) ? (int) $info['system']['memory_bytes'] : null,
                        'docker' => self::text($info['docker']['version'] ?? null),
                        'containers' => isset($info['docker']['containers']) ? ['running' => (int) ($info['docker']['containers']['running'] ?? 0), 'total' => (int) ($info['docker']['containers']['total'] ?? 0)] : null,
                    ];
                }
                $info = Daemon::node($node)->systemInformation();
            } catch (Throwable $exception) {
                return [...self::offline(), 'error' => mb_strimwidth($exception->getMessage(), 0, 200, '…')];
            }

            return [
                ...self::offline(),
                'online' => true,
                'version' => self::text($info['version'] ?? null),
                'os' => self::text($info['os'] ?? null),
                'kernel' => self::text($info['kernel_version'] ?? null),
                'architecture' => self::text($info['architecture'] ?? null),
                'cpu_threads' => isset($info['cpu_count']) ? (int) $info['cpu_count'] : null,
            ];
        });
    }

    /** The newest Wings release on GitHub, asked at most every six hours. Null when it cannot be read. */
    public static function latestWings(): ?string
    {
        if (! Settings::bool('check_updates')) {
            return null;
        }

        return Cache::remember('prism-nodes:latest-wings', 6 * 3600, static function (): ?string {
            try {
                $tag = Http::timeout(8)->acceptJson()->get('https://api.github.com/repos/pterodactyl/wings/releases/latest')->throw()->json('tag_name');

                return is_string($tag) ? ltrim($tag, 'v') : null;
            } catch (Throwable) {
                return null;
            }
        });
    }

    /** Whether $latest is a newer version than $running, comparing numbers only. */
    public static function behind(?string $running, ?string $latest): bool
    {
        if ($running === null || $latest === null || preg_match('/^\d+(\.\d+)*/', $running, $have) !== 1 || preg_match('/^\d+(\.\d+)*/', $latest, $want) !== 1) {
            return false;
        }

        return version_compare($have[0], $want[0], '<');
    }

    /** Adds up what each node's servers use right now and keeps it for the graphs. */
    public static function sample(): void
    {
        $reader = app(ReadsServerState::class);
        foreach (Node::query()->get() as $node) {
            $cpu = 0.0;
            $memory = 0;
            $disk = 0;
            $running = 0;
            foreach (Server::query()->where('node_id', $node->id)->whereNull('status')->get() as $server) {
                try {
                    $state = $reader->read($server);
                } catch (Throwable) {
                    continue;
                }
                $cpu += (float) $state->cpuAbsolute;
                $memory += $state->memoryBytes;
                $disk += $state->diskBytes;
                $running += $state->state === 'running' ? 1 : 0;
            }

            Sample::query()->create(['node_id' => $node->id, 'taken_at' => now(), 'cpu' => round($cpu, 2), 'memory_bytes' => $memory, 'disk_bytes' => $disk, 'running' => $running]);
        }

        Sample::query()->where('taken_at', '<', now()->subDays(self::KEEP_DAYS))->delete();
    }

    private static function offline(): array
    {
        return ['online' => false, 'error' => null, 'version' => null, 'os' => null, 'kernel' => null, 'architecture' => null, 'cpu_threads' => null, 'memory_bytes' => null, 'docker' => null, 'containers' => null];
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? mb_substr($value, 0, 120) : null;
    }
}
