<?php

declare(strict_types=1);

namespace PrismAudit\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Something risky an alert rule spotted.
 *
 * @property int $id
 * @property string $rule
 * @property int|null $activity_log_id
 * @property int|null $user_id
 * @property string|null $ip
 * @property string $summary
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable|null $read_at
 */
class Alert extends Model
{
    public const null UPDATED_AT = null;

    protected $table = 'prism_audit_alerts';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime', 'read_at' => 'immutable_datetime'];
    }
}
