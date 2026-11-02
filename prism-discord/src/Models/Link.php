<?php

declare(strict_types=1);

namespace PrismDiscord\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * A panel user's Discord account, for slash commands.
 *
 * @property int $id
 * @property int $user_id
 * @property string $discord_id
 * @property string $discord_name
 * @property \Illuminate\Support\Carbon|null $last_used_at
 * @property-read User $user
 */
class Link extends Model
{
    protected $table = 'prism_discord_links';

    protected $guarded = ['id'];

    protected $casts = ['last_used_at' => 'datetime'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
