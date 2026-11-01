<?php

declare(strict_types=1);

namespace PrismNotes\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * A note or checklist on a server, for everyone who may read the server's notes.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $user_id who wrote it
 * @property int|null $updated_by who last changed it
 * @property string $kind note or checklist
 * @property string $title
 * @property string $body markdown, shown without raw HTML
 * @property list<array{id: string, text: string, done: bool, done_by: string|null, done_at: string|null}> $items
 * @property bool $pinned
 * @property string|null $color hex
 * @property int $position
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read User|null $user
 * @property-read User|null $editor
 */
class Note extends Model
{
    public const array KINDS = ['note', 'checklist'];

    protected $table = 'prism_notes_notes';

    protected $guarded = ['id'];

    protected $casts = [
        'items' => 'array',
        'pinned' => 'boolean',
        'position' => 'integer',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
