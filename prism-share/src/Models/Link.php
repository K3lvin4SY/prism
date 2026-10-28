<?php

declare(strict_types=1);

namespace PrismShare\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * A guest link to a server, made by one of its users. It can never do more than that user may.
 *
 * @property int $id
 * @property string $uuid also the user_uuid of its Wings tokens, so revoking it can drop them
 * @property int $server_id
 * @property int $user_id
 * @property string $label
 * @property string $token_hash
 * @property list<string> $permissions option keys from Capabilities::OPTIONS
 * @property list<string> $paths folders and files that may be downloaded
 * @property list<string> $backups backup uuids that may be downloaded
 * @property \Illuminate\Support\Carbon $expires_at
 * @property \Illuminate\Support\Carbon|null $revoked_at
 * @property \Illuminate\Support\Carbon|null $last_used_at
 * @property int $uses
 * @property \Illuminate\Support\Carbon $created_at
 * @property-read Server $server
 * @property-read User $user
 */
class Link extends Model
{
    protected $table = 'prism_share_links';

    protected $guarded = ['id'];

    protected $hidden = ['token_hash'];

    protected $casts = [
        'permissions' => 'array',
        'paths' => 'array',
        'backups' => 'array',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_used_at' => 'datetime',
        'uses' => 'integer',
    ];

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function active(): bool
    {
        return $this->revoked_at === null && $this->expires_at->isFuture();
    }
}
