<?php

declare(strict_types=1);

namespace PrismMc\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use PrismMc\Support\Detector;
use PrismMc\Support\InstallPlan;
use PrismMc\Support\Mrpack;
use PrismMc\Support\ServerProperties;
use PrismMc\Support\Relay;
use PrismMc\Support\ServerFiles;
use PrismMc\Support\Settings;
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
            Log::warning('Prism MC install failed', ['job' => $this->jobId, 'server' => $server->uuid, 'exception' => $exception]);
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

            case 'relay':
                // Fetch in one slice and upload in the next, so neither outlives the queue's time limit.
                if (! isset($state['relays'][$state['cursor']])) {
                    $state['relays'][$state['cursor']] = Relay::fetch($step['url'], $this->jobId);
                    $state['pending'] = ['fraction' => 0.5];

                    return false;
                }

                Relay::upload($server, $state['relays'][$state['cursor']]['file'], ServerFiles::join($step['dir'], $step['file']));

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

            case 'property':
                $properties = ServerProperties::load($server);
                // Pumpkin writes pumpkin.toml on its first start, and its egg only seeds the
                // ports into a file that is not there yet: a file of one key would lose them.
                if (! $properties->isPumpkin() || $properties->exists) {
                    $properties->set($step['key'], (string) $step['value'])->save();
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

            case 'yaml-set':
                // Sets top-level-looking keys wherever they are indented; the first match wins.
                foreach ($step['candidates'] as $candidate) {
                    $yaml = $files->read($candidate, 512_000);
                    if ($yaml === null) {
                        continue;
                    }

                    foreach ($step['values'] as $key => $value) {
                        $yaml = (string) preg_replace('/^(\s*'.preg_quote((string) $key, '/').':)[ \t]*[^\r\n#]*/m', '$1 '.$value, $yaml, 1);
                    }

                    $files->write($candidate, $yaml);

                    return true;
                }

                throw new RuntimeException('The config file to change was not found.');

            case 'variable':
                // Sets an egg variable for this server, as an administrator would.
                $variable = $server->egg->variables()->where('env_variable', $step['env'])->first();
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

            case 'mrpack':
                // Expands into the pack's own steps, which run next.
                array_splice($state['steps'], $state['cursor'] + 1, 0, Mrpack::expand($server, $step, $this->jobId));
                // Progress restarts from here, measured over the steps the pack added.
                $state['offset'] = ['cursor' => $state['cursor'] + 1, 'percent' => 5];

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
            'mrpack' => 'Downloading and reading the modpack.',
            'archive-write' => sprintf('Writing config files (%d of %d).', $state['pending']['index'] ?? 0, $step['count'] ?? 0),
            'relay' => 'Downloading through the Panel.',
            'verify' => 'Checking '.basename((string) ($step['path'] ?? 'the download')).'.',
            'property' => 'Updating the server settings.',
            'wait-file' => 'Starting the server once so it writes its config.',
            'yaml-set' => 'Changing the config.',
            'reinstall', 'wait-installed' => 'The egg is reinstalling the server.',
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
