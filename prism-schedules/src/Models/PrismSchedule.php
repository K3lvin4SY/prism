<?php

declare(strict_types=1);

namespace PrismSchedules\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\Server;

/**
 * @property int $id
 * @property int $server_id
 * @property string $name
 * @property bool $enabled
 * @property array{type: string, cron?: string, minutes?: int} $trigger
 * @property array<string, mixed>|null $conditions
 * @property list<array<string, mixed>> $steps
 * @property string|null $color
 * @property \Illuminate\Support\Carbon|null $paused_until
 * @property \Illuminate\Support\Carbon|null $next_run_at
 * @property \Illuminate\Support\Carbon|null $last_run_at
 * @property string|null $last_status
 * @property-read Server $server
 */
class PrismSchedule extends Model
{
    protected $table = 'prism_schedules';

    protected $guarded = ['id'];

    protected $casts = [
        'enabled' => 'boolean',
        'trigger' => 'array',
        'conditions' => 'array',
        'steps' => 'array',
        'paused_until' => 'datetime',
        'next_run_at' => 'datetime',
        'last_run_at' => 'datetime',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function runs(): HasMany
    {
        return $this->hasMany(ScheduleRun::class, 'schedule_id');
    }

    public function paused(): bool
    {
        return $this->paused_until !== null && $this->paused_until->isFuture();
    }
}
