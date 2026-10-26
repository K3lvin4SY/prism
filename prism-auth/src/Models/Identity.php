<?php

declare(strict_types=1);

namespace PrismAuth\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * An account at a provider, linked to a panel user.
 *
 * @property int $id
 * @property int $user_id
 * @property int $provider_id
 * @property string $subject
 * @property string|null $email
 * @property string|null $display_name
 * @property string|null $avatar
 * @property \Illuminate\Support\Carbon|null $last_used_at
 * @property \Illuminate\Support\Carbon $created_at
 * @property-read AuthProvider $provider
 * @property-read User $user
 */
class Identity extends Model
{
    protected $table = 'prism_auth_identities';

    protected $guarded = ['id'];

    protected $casts = [
        'last_used_at' => 'datetime',
    ];

    /** @return BelongsTo<AuthProvider, $this> */
    public function provider(): BelongsTo
    {
        return $this->belongsTo(AuthProvider::class, 'provider_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
