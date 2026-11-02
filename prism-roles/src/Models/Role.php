<?php

declare(strict_types=1);

namespace PrismRoles\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\User;

/**
 * A named set of subuser permissions: panel-wide (no owner, kept by the admins) or one user's own.
 *
 * @property int $id
 * @property int|null $owner_id
 * @property string $name
 * @property string $description
 * @property string|null $color
 * @property list<string> $permissions
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read User|null $owner
 */
class Role extends Model
{
    protected $table = 'prism_roles_roles';

    protected $guarded = ['id'];

    protected $casts = ['permissions' => 'array'];

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /** @return HasMany<Assignment, $this> */
    public function assignments(): HasMany
    {
        return $this->hasMany(Assignment::class);
    }
}
