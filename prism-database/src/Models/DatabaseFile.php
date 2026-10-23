<?php

declare(strict_types=1);

namespace PrismDatabase\Models;

use Illuminate\Database\Eloquent\Model;
use Pterodactyl\Models\Database;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A backup, import or export of a database: a file on the panel and the job that made or
 * reads it.
 *
 * @property int $id
 * @property int $database_id
 * @property string $type backup|export|import|restore
 * @property string $status pending|running|done|failed
 * @property string|null $label
 * @property bool $automatic
 * @property bool $locked
 * @property string|null $path
 * @property int $size
 * @property string|null $message
 * @property array<string, mixed>|null $state
 * @property int|null $user_id
 * @property \Illuminate\Support\Carbon|null $expires_at
 * @property \Illuminate\Support\Carbon|null $finished_at
 * @property \Illuminate\Support\Carbon $created_at
 */
class DatabaseFile extends Model
{
    protected $table = 'prism_database_files';

    protected $guarded = ['id'];

    protected $casts = [
        'automatic' => 'boolean',
        'locked' => 'boolean',
        'size' => 'integer',
        'state' => 'array',
        'expires_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function database(): BelongsTo
    {
        return $this->belongsTo(Database::class);
    }

    /** @param array<string, mixed> $patch */
    public function patchState(array $patch): void
    {
        $this->state = [...($this->state ?? []), ...$patch];
    }

    /** @return array<string, mixed> */
    public function present(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'label' => $this->label,
            'automatic' => $this->automatic,
            'locked' => $this->locked,
            'size' => $this->size,
            'message' => $this->message,
            'progress' => isset($this->state['progress']) ? (float) $this->state['progress'] : null,
            'statements' => (int) ($this->state['statements'] ?? 0),
            'errors' => (int) ($this->state['errors'] ?? 0),
            'downloadable' => in_array($this->type, ['backup', 'export'], true) && $this->status === 'done' && $this->path !== null && is_file($this->path),
            'name' => $this->state['name'] ?? ($this->path ? basename($this->path) : null),
            'createdAt' => $this->created_at?->toAtomString(),
            'finishedAt' => $this->finished_at?->toAtomString(),
            'expiresAt' => $this->expires_at?->toAtomString(),
        ];
    }
}
