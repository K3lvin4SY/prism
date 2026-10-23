<?php

declare(strict_types=1);

namespace PrismSchedules\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use PrismSchedules\Models\ScheduleRun;
use PrismSchedules\Support\Engine;
use Throwable;

/**
 * Moves a run forward: steps that finish at once run back to back for up to half a minute, and
 * a step that waits queues this job again for when it is due.
 */
class RunSchedule implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    private const int SLICE_SECONDS = 30;

    public function __construct(public int $run)
    {
        $this->onQueue('standard');
    }

    public function handle(): void
    {
        $started = time();

        while (true) {
            $run = ScheduleRun::query()->with(['schedule', 'server'])->find($this->run);
            if (! $run instanceof ScheduleRun || $run->finished()) {
                return;
            }

            try {
                $delay = Engine::step($run);
            } catch (Throwable $exception) {
                Log::warning('Prism Schedules run failed', ['run' => $run->id, 'exception' => $exception]);
                Engine::finish($run, 'failed', 'Stopped: '.$exception->getMessage());

                return;
            }

            if ($delay === null) {
                return;
            }

            if ($delay === 0 && time() - $started < self::SLICE_SECONDS) {
                continue;
            }

            $state = $run->state;
            $state['wakeAt'] = time() + $delay;
            $run->forceFill(['state' => $state])->save();
            self::dispatch($run->id)->delay(now()->addSeconds($delay));

            return;
        }
    }
}
