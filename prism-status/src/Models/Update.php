<?php

declare(strict_types=1);

namespace PrismStatus\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * One post on an incident.
 *
 * @property int $id
 * @property int $incident_id
 * @property string $status
 * @property string $body
 * @property CarbonImmutable $created_at
 */
class Update extends Model
{
    public const null UPDATED_AT = null;

    protected $table = 'prism_status_updates';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime'];
    }
}
