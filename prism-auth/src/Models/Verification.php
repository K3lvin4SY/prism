<?php

declare(strict_types=1);

namespace PrismAuth\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A sign-up waiting for its email link. Only the SHA-256 of the link's token is stored.
 *
 * @property int $id
 * @property string $token
 * @property string $email
 * @property string $username
 * @property string $name_first
 * @property string $name_last
 * @property string|null $password a hash, or null for an account made through a provider
 * @property int|null $provider_id
 * @property string|null $subject
 * @property array{email?: string|null, name?: string|null, avatar?: string|null}|null $profile
 * @property string|null $ip
 * @property \Illuminate\Support\Carbon $expires_at
 */
class Verification extends Model
{
    protected $table = 'prism_auth_verifications';

    protected $guarded = ['id'];

    protected $hidden = ['token', 'password'];

    protected $casts = [
        'profile' => 'array',
        'expires_at' => 'datetime',
    ];
}
