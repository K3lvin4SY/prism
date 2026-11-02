<?php

declare(strict_types=1);

namespace PrismRoles\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;

/**
 * The role a subuser was given. While it is not customised, changing the role changes them too.
 *
 * @property int $id
 * @property int $subuser_id
 * @property int $role_id
 * @property int|null $assigned_by who gave it; a re-applied role never grants more than they hold
 * @property list<string> $applied the permissions the role last gave the subuser
 * @property bool $customised
 * @property-read Role $role
 * @property-read Subuser $subuser
 * @property-read User|null $assigner
 */
class Assignment extends Model
{
    protected $table = 'prism_roles_assignments';

    protected $guarded = ['id'];

    protected $casts = ['applied' => 'array', 'customised' => 'boolean'];

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /** @return BelongsTo<Subuser, $this> */
    public function subuser(): BelongsTo
    {
        return $this->belongsTo(Subuser::class);
    }

    /** @return BelongsTo<User, $this> */
    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
