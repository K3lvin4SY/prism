<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Illuminate\Support\Facades\Cache;
use PrismSatisfactory\Jobs\RunInstallPlan;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Extensions\ExtensionJobProgress;

/**
 * A list of file and power steps run on the queue in short slices, so a long install never
 * outlives the queue's retry window. Progress is reported through the Panel's job progress.
 *
 * Steps:
 *  power        {action: start|stop|kill}
 *  wait-offline {}
 *  rename       {dir, from, to, optional?}
 *  delete       {dir, files}
 *  mkdir        {path}
 *  pull         {url, dir, file, size?}             a Wings background download
 *  unzip        {dir, file}
 *  write        {path, content (base64)}
 *  record       {key, value}                        per-server metadata
 *  forget       {key}
 *  refresh      {}                                  drops the cached detection result
 */
final class InstallPlan
{
    private const int LOCK_SECONDS = 3600;

    /** @var list<array<string, mixed>> */
    private array $steps = [];

    /** @var list<array<string, mixed>> steps run if the plan fails */
    private array $rollback = [];

    public function __construct(private readonly Server $server, private readonly string $label) {}

    public static function for(Server $server, string $label): self
    {
        return new self($server, $label);
    }

    /** @param array<string, mixed> $options */
    public function add(string $type, array $options = []): self
    {
        $this->steps[] = ['type' => $type, ...$options];

        return $this;
    }

    /** @param list<array<string, mixed>> $steps */
    public function addSteps(array $steps): self
    {
        foreach ($steps as $step) {
            $this->steps[] = $step;
        }

        return $this;
    }

    /** @param array<string, mixed> $options */
    public function onFailure(string $type, array $options = []): self
    {
        $this->rollback[] = ['type' => $type, ...$options];

        return $this;
    }

    /** Stops the server and waits for it to go offline. */
    public function stopServer(): self
    {
        return $this->add('power', ['action' => 'stop'])->add('wait-offline');
    }

    public static function isBusy(Server $server): bool
    {
        return Cache::has(self::lockKey($server));
    }

    /** The running plan's job id for a server, if any. */
    public static function current(Server $server): ?string
    {
        $id = Cache::get(self::lockKey($server));

        return is_string($id) ? $id : null;
    }

    /**
     * Queues the plan and returns its job id for progress polling.
     */
    public function dispatch(User $user, string $permission): string
    {
        abort_if(self::isBusy($this->server), 409, 'Another install is already running on this server.');

        $job = app(ExtensionJobProgress::class)->begin(Settings::EXTENSION, $user, $this->server, 'ext.prism-satisfactory.'.$permission);
        app(ExtensionJobProgress::class)->update(Settings::EXTENSION, $job->id, 0, $this->label.': queued.');

        Cache::put(self::lockKey($this->server), $job->id, self::LOCK_SECONDS);
        Cache::put(self::stateKey($job->id), [
            'server' => $this->server->id,
            'label' => $this->label,
            'steps' => $this->steps,
            'rollback' => $this->rollback,
            'cursor' => 0,
            'pending' => null,
            'started' => time(),
        ], self::LOCK_SECONDS);

        RunInstallPlan::dispatch($job->id);

        return $job->id;
    }

    public static function stateKey(string $jobId): string
    {
        return 'ext:prism-satisfactory:plan:'.$jobId;
    }

    public static function lockKey(Server $server): string
    {
        return 'ext:prism-satisfactory:busy:'.$server->uuid;
    }
}
