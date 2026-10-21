<?php

declare(strict_types=1);

namespace McSuite\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use McSuite\Support\Detector;
use McSuite\Support\InstallPlan;
use McSuite\Support\Mrpack;
use McSuite\Support\Relay;
use McSuite\Support\ServerFiles;
use McSuite\Support\Settings;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionJobProgress;
use RuntimeException;
use Throwable;

/**
 * Runs an InstallPlan for about forty seconds, then queues itself to carry on. Waiting
 * steps (downloads, shutdown) re-queue with a short delay instead of blocking a worker.
 */
class RunInstallPlan implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    private const int SLICE_SECONDS = 40;

    private const int MAX_PARALLEL_PULLS = 3;

    private const int PULL_TIMEOUT = 1800;

    private const int SHUTDOWN_TIMEOUT = 90;

    public function __construct(public string $jobId)
    {
        $this->onQueue('standard');
    }

    public function handle(ExtensionJobProgress $progress): void
    {
        $state = Cache::get(InstallPlan::stateKey($this->jobId));
        if (! is_array($state)) {
            return;
        }

        $server = Server::query()->find($state['server']);
        if (! $server instanceof Server) {
            Cache::forget(InstallPlan::stateKey($this->jobId));

            return;
        }

        $sliceEnds = time() + self::SLICE_SECONDS;

        try {
            while ($state['cursor'] < count($state['steps'])) {
                $step = $state['steps'][$state['cursor']];
                $done = $this->run($server, $step, $state);

                if (! $done) {
                    $this->save($state);
                    $this->report($progress, $state);
                    self::dispatch($this->jobId)->delay(now()->addSeconds(3));

                    return;
                }

                $state['cursor']++;
                $state['pending'] = null;
                $this->report($progress, $state);

                if (time() >= $sliceEnds) {
                    $this->save($state);
                    self::dispatch($this->jobId);

                    return;
                }
            }
        } catch (Throwable $exception) {
            Log::warning('MC Suite install failed', ['job' => $this->jobId, 'server' => $server->uuid, 'exception' => $exception]);
            $this->finish($server, $progress, 'failed', $state['label'].' failed: '.self::describe($exception));

            return;
        }

        $this->finish($server, $progress, 'completed', $state['label'].': done.');
    }

    /**
     * Runs one step. Returns false when the step must be checked again later.
     *
     * @param  array<string, mixed>  $step
     * @param  array<string, mixed>  $state
     */
    private function run(Server $server, array $step, array &$state): bool
    {
        $files = ServerFiles::for($server);

        switch ($step['type']) {
            case 'power':
                if ($step['action'] === 'stop' && $this->state($server) === 'offline') {
                    return true;
                }

                Daemon::server($server)->power($step['action']);

                return true;

            case 'wait-offline':
                $state['pending'] ??= ['since' => time()];
                if ($this->state($server) === 'offline') {
                    return true;
                }

                if (time() - $state['pending']['since'] > self::SHUTDOWN_TIMEOUT && ! ($state['pending']['killed'] ?? false)) {
                    Daemon::server($server)->power('kill');
                    $state['pending']['killed'] = true;
                }

                return false;

            case 'rename':
                $from = ServerFiles::join($step['dir'], $step['from']);
                if (($step['optional'] ?? false) && $files->size($from) === null && ! $this->isDirectory($files, $from)) {
                    return true;
                }

                $target = ServerFiles::join($step['dir'], $step['to']);
                if ($files->size($target) !== null) {
                    $files->delete(dirname($target) === '.' ? '' : dirname($target), [basename($target)]);
                }

                $files->rename($step['dir'], $step['from'], $step['to']);

                return true;

            case 'delete':
                $existing = $files->list($step['dir']);
                $files->delete($step['dir'], array_values(array_filter($step['files'], static fn (string $name): bool => array_key_exists($name, $existing))));

                return true;

            case 'mkdir':
                $files->makeDirectory($step['path']);

                return true;

            case 'pull':
                return $this->pull($files, [$step], $state);

            case 'pulls':
                return $this->pull($files, $step['files'], $state);

            case 'relay':
                $relay = $state['relays'][$state['cursor']] ??= Relay::fetch($step['url'], $this->jobId);
                $done = $this->pull($files, [['url' => $relay['url'], 'dir' => $step['dir'], 'file' => $step['file'], 'size' => $relay['size']]], $state);

                if ($done) {
                    Relay::forget($relay['token']);
                }

                return $done;

            case 'unzip':
                $files->decompress($step['dir'], $step['file']);

                return true;

            case 'write':
                $directory = dirname(ServerFiles::normalize($step['path']));
                if ($directory !== '.') {
                    $files->makeDirectory($directory);
                }

                $files->write($step['path'], (string) base64_decode($step['content'], true));

                return true;

            case 'mrpack':
                // Expands into the pack's own steps, which run next.
                array_splice($state['steps'], $state['cursor'] + 1, 0, Mrpack::expand($server, $step, $this->jobId));

                return true;

            case 'archive-write':
                $next = Mrpack::writeOverrides($server, $step['archive'], $step['prefixes'], (int) ($state['pending']['index'] ?? 0), time() + 25);
                if ($next !== null) {
                    $state['pending'] = ['index' => $next, 'fraction' => $next / max(1, (int) $step['count'])];

                    return false;
                }

                return true;

            case 'remove-local':
                @unlink(Relay::directory().'/'.basename($step['file']));

                return true;

            case 'forget-prefix':
                Settings::server($server)->forgetByPrefix($step['prefix']);

                return true;

            case 'record':
                Settings::server($server)->set($step['key'], $step['value']);

                return true;

            case 'forget':
                Settings::server($server)->forget($step['key']);

                return true;

            case 'refresh':
                Detector::forget($server);

                return true;
        }

        throw new RuntimeException('Unknown install step '.$step['type'].'.');
    }

    /**
     * Starts up to three Wings downloads at a time and checks their sizes until all are complete.
     *
     * @param  list<array<string, mixed>>  $pulls
     * @param  array<string, mixed>  $state
     */
    private function pull(ServerFiles $files, array $pulls, array &$state): bool
    {
        $pending = $state['pending'] ??= ['started' => [], 'done' => [], 'sizes' => [], 'since' => time()];
        throw_if(time() - $pending['since'] > self::PULL_TIMEOUT, RuntimeException::class, 'Downloads took too long.');

        $listings = [];
        $made = [];
        $active = 0;
        foreach ($pulls as $index => $pull) {
            if (isset($pending['done'][$index])) {
                continue;
            }

            if (! isset($pending['started'][$index])) {
                continue;
            }

            $directory = ServerFiles::normalize($pull['dir']);
            $listings[$directory] ??= $files->list($directory);
            $size = $listings[$directory][$pull['file']]['size'] ?? null;
            $expected = $pull['size'] ?? null;
            throw_if($size === null && time() - $pending['started'][$index] > 120, RuntimeException::class, 'The download of '.$pull['file'].' did not start. The node may block downloads from this site.');

            $complete = $expected !== null
                ? $size === (int) $expected
                : $size !== null && $size > 0 && ($pending['sizes'][$index] ?? null) === $size;

            if ($complete) {
                $pending['done'][$index] = true;
            } else {
                $pending['sizes'][$index] = $size;
                $active++;
            }
        }

        foreach ($pulls as $index => $pull) {
            if ($active >= self::MAX_PARALLEL_PULLS) {
                break;
            }

            if (isset($pending['started'][$index]) || isset($pending['done'][$index])) {
                continue;
            }

            $directory = ServerFiles::normalize($pull['dir']);
            if ($directory !== '' && ! isset($made[$directory])) {
                $files->makeDirectory($directory);
                $made[$directory] = true;
            }

            // A file of the same name is replaced, not appended to.
            $existing = $files->list($directory);
            if (isset($existing[$pull['file']])) {
                $files->delete($directory, [$pull['file']]);
            }

            $files->pull($pull['url'], $directory, $pull['file']);
            $pending['started'][$index] = time();
            $active++;
        }

        $pending['fraction'] = count($pulls) === 0 ? 1 : count($pending['done']) / count($pulls);
        $state['pending'] = $pending;

        return count($pending['done']) === count($pulls);
    }

    private function isDirectory(ServerFiles $files, string $path): bool
    {
        $directory = dirname($path) === '.' ? '' : dirname($path);
        $entry = $files->list($directory)[basename($path)] ?? null;

        return $entry !== null && ! $entry['file'];
    }

    private function state(Server $server): string
    {
        return (string) (Daemon::server($server)->details()['state'] ?? 'offline');
    }

    /** @param array<string, mixed> $state */
    private function report(ExtensionJobProgress $progress, array $state): void
    {
        $total = max(1, count($state['steps']));
        $fraction = (float) ($state['pending']['fraction'] ?? 0);
        $percent = (int) min(99, floor((($state['cursor'] + $fraction) / $total) * 100));
        $step = $state['steps'][$state['cursor']] ?? null;

        $message = match ($step['type'] ?? null) {
            'power', 'wait-offline' => 'Stopping the server.',
            'pull', 'pulls' => isset($step['files']) ? sprintf('Downloading files (%d of %d).', count($state['pending']['done'] ?? []), count($step['files'])) : 'Downloading '.($step['file'] ?? 'files').'.',
            'unzip' => 'Extracting '.($step['file'] ?? 'archive').'.',
            'mrpack' => 'Downloading and reading the modpack.',
            'archive-write' => sprintf('Writing config files (%d of %d).', $state['pending']['index'] ?? 0, $step['count'] ?? 0),
            'relay' => 'Downloading through the Panel.',
            'write' => 'Writing '.($step['path'] ?? 'files').'.',
            'delete', 'rename' => 'Moving old files aside.',
            default => 'Working.',
        };

        try {
            $current = $progress->find(Settings::EXTENSION, $this->jobId);
            if ($current !== null && $current->percent > $percent) {
                $percent = $current->percent;
            }

            $progress->update(Settings::EXTENSION, $this->jobId, $percent, mb_substr($state['label'].': '.$message, 0, 1000));
        } catch (Throwable) {
            // Progress is best effort; the install itself carries on.
        }
    }

    /** @param array<string, mixed> $state */
    private function save(array $state): void
    {
        Cache::put(InstallPlan::stateKey($this->jobId), $state, 3600);
    }

    private function finish(Server $server, ExtensionJobProgress $progress, string $status, string $message): void
    {
        Cache::forget(InstallPlan::stateKey($this->jobId));
        if (Cache::get(InstallPlan::lockKey($server)) === $this->jobId) {
            Cache::forget(InstallPlan::lockKey($server));
        }

        Detector::forget($server);

        try {
            $progress->update(Settings::EXTENSION, $this->jobId, 100, mb_substr($message, 0, 1000), $status);
        } catch (Throwable) {
            // The snapshot may already be finished or expired.
        }
    }

    private static function describe(Throwable $exception): string
    {
        $message = trim($exception->getMessage());

        return $message !== '' ? mb_substr($message, 0, 300) : class_basename($exception);
    }

    public function failed(?Throwable $exception): void
    {
        $state = Cache::get(InstallPlan::stateKey($this->jobId));
        $server = is_array($state) ? Server::query()->find($state['server']) : null;
        if ($server instanceof Server) {
            $this->finish($server, app(ExtensionJobProgress::class), 'failed', ($state['label'] ?? 'Install').' failed: '.($exception ? self::describe($exception) : 'the worker stopped.'));
        }
    }
}
