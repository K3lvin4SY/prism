<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use PrismCoreKeeper\Support\Detector;
use PrismCoreKeeper\Support\InstallPlan;
use PrismCoreKeeper\Support\ServerFiles;
use PrismCoreKeeper\Support\Settings;
use PrismCoreKeeper\Support\StartHook;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Contracts\Servers\ReinstallsServers;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
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
            Log::warning('Prism Core Keeper install failed', ['job' => $this->jobId, 'server' => $server->uuid, 'exception' => $exception]);
            $this->rollback($server, $state);
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
                if (($step['ifMissing'] ?? false) && $files->size($target) !== null) {
                    return true;
                }

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

            case 'move-contents':
                // Moves everything in a folder into another, replacing what is there: how a
                // server zip's Linux/ folder becomes the server.
                $target = ServerFiles::normalize($step['to']);
                $existing = $files->list($target);
                foreach (array_keys($files->list($step['from'])) as $name) {
                    if (isset($existing[$name])) {
                        $files->delete($target, [$name]);
                    }

                    $files->rename('', ServerFiles::join($step['from'], $name), $target === '' ? $name : ServerFiles::join($target, $name));
                }

                return true;

            case 'chmod':
                foreach ($step['files'] as $file) {
                    if ($files->size(ServerFiles::join($step['dir'], $file)) !== null) {
                        $files->chmod($step['dir'], $file, (string) $step['mode']);
                    }
                }

                return true;

            case 'collect':
                // Moves every file with the extension out of an unpacked archive, however deep,
                // and records which ones were moved so they can be removed together later.
                $moved = [];
                $existing = $files->list($step['to']);
                $walk = function (string $directory, int $depth) use (&$walk, &$moved, &$existing, $files, $step): void {
                    foreach ($files->list($directory) as $name => $entry) {
                        $path = ServerFiles::join($directory, $name);
                        if (! $entry['file']) {
                            if ($depth < 4) {
                                $walk($path, $depth + 1);
                            }

                            continue;
                        }

                        if (! str_ends_with(strtolower($name), '.'.$step['extension']) || in_array($name, $step['keep'] ?? [], true) || in_array($name, $moved, true)) {
                            continue;
                        }

                        if (isset($existing[$name])) {
                            $files->delete($step['to'], [$name]);
                        }

                        $files->rename('', $path, ServerFiles::join($step['to'], $name));
                        $existing[$name] = true;
                        $moved[] = $name;
                    }
                };
                $walk(ServerFiles::normalize($step['from']), 0);
                throw_if($moved === [], RuntimeException::class, 'The download had no .'.$step['extension'].' files in it.');

                if (isset($step['record'])) {
                    Settings::server($server)->set($step['record']['key'], [...$step['record']['value'], 'files' => $moved]);
                }

                return true;

            case 'archive':
                // A backup archive of some files, made by Wings beside them.
                $existing = $files->list($step['dir']);
                $present = array_values(array_filter($step['files'], static fn (string $name): bool => array_key_exists($name, $existing)));
                if ($present === [] && ($step['optional'] ?? false)) {
                    return true;
                }
                $files->compress($step['dir'], $present);

                return true;

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

            case 'verify':
                // Checks a downloaded file against the hash its publisher gave.
                $content = $files->read($step['path'], 80 * 1024 * 1024);
                throw_if($content === null, RuntimeException::class, basename($step['path']).' was not downloaded.');
                $hash = hash($step['algorithm'], $content);
                unset($content);
                if (! hash_equals(strtolower((string) $step['hash']), $hash)) {
                    $files->delete(dirname($step['path']) === '.' ? '' : dirname($step['path']), [basename($step['path'])]);
                    throw new RuntimeException(basename($step['path']).' did not match its published checksum and was removed.');
                }

                return true;

            case 'wait-file':
                $state['pending'] ??= ['since' => time()];
                foreach ($step['candidates'] as $candidate) {
                    if ($files->size($candidate) !== null) {
                        return true;
                    }
                }

                throw_if(time() - $state['pending']['since'] > ($step['timeout'] ?? 300), RuntimeException::class, 'The server did not create '.basename($step['candidates'][0]).' in time. Check the console for errors.');

                return false;

            case 'variable':
                // Sets an egg variable for this server, as an administrator would.
                $variable = $server->egg->variables()->where('env_variable', $step['env'])->first();
                if ($variable === null && ($step['optional'] ?? false)) {
                    return true;
                }
                throw_unless($variable, RuntimeException::class, 'The egg has no '.$step['env'].' variable.');
                ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => (string) $step['value']]);

                return true;

            case 'reinstall':
                app(ReinstallsServers::class)->reinstall($server->fresh());

                return true;

            case 'wait-installed':
                $state['pending'] ??= ['since' => time()];
                $status = $server->fresh()?->status;
                throw_if(in_array($status, [Server::STATUS_INSTALL_FAILED, Server::STATUS_REINSTALL_FAILED], true), RuntimeException::class, 'The egg install script failed. Its output is in the console.');
                throw_if(time() - $state['pending']['since'] > 1200, RuntimeException::class, 'The install took longer than twenty minutes.');

                return $status !== Server::STATUS_INSTALLING;

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

            case 'start-hook':
                StartHook::install($server->fresh());

                return true;

            case 'flatten':
                // A mod zip may hold its files in a folder of their own: the folder with
                // ModManifest.json becomes the mod's folder.
                $root = ServerFiles::normalize($step['dir']);
                if ($files->size(ServerFiles::join($root, 'ModManifest.json')) !== null) {
                    return true;
                }
                foreach ($files->list($root) as $name => $entry) {
                    if (! $entry['file'] && $files->size(ServerFiles::join($root, $name, 'ModManifest.json')) !== null) {
                        $inner = ServerFiles::join($root, $name);
                        foreach (array_keys($files->list($inner)) as $child) {
                            $files->rename('', ServerFiles::join($inner, $child), ServerFiles::join($root, $child === $name ? $child.'.inner' : $child));
                        }
                        $files->delete($root, [$name]);

                        return true;
                    }
                }

                throw new RuntimeException('The download has no ModManifest.json, so it is not a Core Keeper mod.');
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
        $fraction = (float) ($state['pending']['fraction'] ?? 0);
        $start = (int) ($state['offset']['cursor'] ?? 0);
        $base = (int) ($state['offset']['percent'] ?? 0);
        $total = max(1, count($state['steps']) - $start);
        $percent = (int) min(99, $base + floor((max(0, $state['cursor'] - $start) + $fraction) / $total * (100 - $base)));
        $step = $state['steps'][$state['cursor']] ?? null;

        $message = match ($step['type'] ?? null) {
            'power', 'wait-offline' => 'Stopping the server.',
            'pull', 'pulls' => isset($step['files']) ? sprintf('Downloading files (%d of %d).', count($state['pending']['done'] ?? []), count($step['files'])) : 'Downloading '.($step['file'] ?? 'files').'.',
            'unzip' => 'Extracting '.($step['file'] ?? 'archive').'.',
            'archive' => 'Backing up the worlds.',
            'move-contents', 'chmod' => 'Putting the new server files in place.',
            'flatten' => 'Putting the mod in place.',
            'start-hook' => 'Adding the Prism start step.',
            'verify' => 'Checking '.basename((string) ($step['path'] ?? 'the download')).'.',
            'wait-file' => 'Waiting for the server.',
            'reinstall', 'wait-installed' => 'The egg is reinstalling the server.',
            'write' => ($step['secret'] ?? false) ? 'Getting the Steam login ready.' : 'Writing '.($step['path'] ?? 'files').'.',
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

    /**
     * Runs the plan's rollback steps after a failure, as far as they go, so the server is
     * left as it was: settings moved aside are put back, half-installed files are removed.
     *
     * @param  array<string, mixed>  $state
     */
    private function rollback(Server $server, array $state): void
    {
        foreach ($state['rollback'] ?? [] as $step) {
            try {
                $scratch = ['pending' => null, 'cursor' => 0, 'steps' => []];
                $this->run($server, $step, $scratch);
            } catch (Throwable) {
                // Best effort: carry on with the remaining steps.
            }
        }
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
            $this->rollback($server, $state);
            $this->finish($server, app(ExtensionJobProgress::class), 'failed', ($state['label'] ?? 'Install').' failed: '.($exception ? self::describe($exception) : 'the worker stopped.'));
        }
    }
}
