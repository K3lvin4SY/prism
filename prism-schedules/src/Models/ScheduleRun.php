<?php

declare(strict_types=1);

namespace PrismSchedules\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * One run of a schedule. `state` holds where it has got to: the path of the next step, the
 * attempts at the current one, and a countdown's or wait's progress.
 *
 * @property int $id
 * @property int $schedule_id
 * @property int $server_id
 * @property int|null $user_id
 * @property string $status running|done|failed|cancelled|skipped
 * @property string $trigger
 * @property list<array{at: string, level: string, text: string, step?: string|null}> $log
 * @property array<string, mixed> $state
 * @property \Illuminate\Support\Carbon $started_at
 * @property \Illuminate\Support\Carbon|null $finished_at
 * @property-read PrismSchedule|null $schedule
 * @property-read Server|null $server
 */
class ScheduleRun extends Model
{
    public $timestamps = false;

    protected $table = 'prism_schedule_runs';

    protected $guarded = ['id'];

    protected $casts = [
        'log' => 'array',
        'state' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public const int LOG_LIMIT = 400;

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(PrismSchedule::class, 'schedule_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function finished(): bool
    {
        return $this->status !== 'running';
    }

    public function write(string $level, string $text, ?string $step = null): void
    {
        $log = $this->log ?? [];
        $log[] = ['at' => now()->toIso8601String(), 'level' => $level, 'text' => mb_substr($text, 0, 2000), 'step' => $step];
        $this->log = array_slice($log, -self::LOG_LIMIT);
    }

    public function present(bool $withLog = false): array
    {
        return [
            'id' => $this->id,
            'scheduleId' => $this->schedule_id,
            'status' => $this->status,
            'trigger' => $this->trigger,
            'step' => $this->state['step'] ?? null,
            'detail' => $this->state['detail'] ?? null,
            'startedAt' => $this->started_at->toIso8601String(),
            'finishedAt' => $this->finished_at?->toIso8601String(),
            ...($withLog ? ['log' => $this->log ?? []] : []),
        ];
    }
}
