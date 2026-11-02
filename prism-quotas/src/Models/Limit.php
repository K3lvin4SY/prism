<?php

declare(strict_types=1);

namespace PrismQuotas\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * What someone may use across the servers they own; without a user, everyone's default.
 *
 * @property int $id
 * @property int|null $user_id
 * @property int $servers
 * @property int $memory MiB in all
 * @property int $disk MiB in all
 * @property int $cpu percent of a thread in all
 * @property int $backups per server
 * @property int $databases per server
 * @property int $allocations ports per server
 * @property-read User|null $user
 */
class Limit extends Model
{
    public const array FIELDS = ['servers', 'memory', 'disk', 'cpu', 'backups', 'databases', 'allocations'];

    protected $table = 'prism_quotas_limits';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return array_fill_keys(self::FIELDS, 'integer');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, int> */
    public function values(): array
    {
        return array_map('intval', $this->only(self::FIELDS));
    }
}
