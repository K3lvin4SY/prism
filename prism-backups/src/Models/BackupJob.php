<?php

declare(strict_types=1);

namespace PrismBackups\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * Opening a backup to browse it, or restoring files from it.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $user_id
 * @property string $backup_uuid
 * @property string $type browse|restore
 * @property string $status pending|running|done|failed
 * @property int $progress
 * @property string|null $message
 * @property array<string, mixed>|null $payload
 * @property array<string, mixed>|null $state
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read Server|null $server
 */
class BackupJob extends Model
{
    protected $table = 'prism_backup_jobs';

    protected $guarded = ['id'];

    protected $casts = [
        'progress' => 'integer',
        'payload' => 'array',
        'state' => 'array',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function finished(): bool
    {
        return in_array($this->status, ['done', 'failed'], true);
    }

    public function present(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'backup' => $this->backup_uuid,
            'status' => $this->status,
            'progress' => $this->progress,
            'message' => $this->message,
            'stage' => $this->state['stage'] ?? null,
            'createdAt' => $this->created_at->toIso8601String(),
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
