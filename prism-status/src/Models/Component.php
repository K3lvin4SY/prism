<?php

declare(strict_types=1);

namespace PrismStatus\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A node or server on the status page.
 *
 * @property int $id
 * @property string $type node or server
 * @property int $ref_id
 * @property string $label
 * @property string $group
 * @property int $sort
 * @property string $state up, starting, down or unknown
 * @property CarbonImmutable|null $checked_at
 * @property CarbonImmutable|null $changed_at
 */
class Component extends Model
{
    public const array TYPES = ['node', 'server'];

    protected $table = 'prism_status_components';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['checked_at' => 'immutable_datetime', 'changed_at' => 'immutable_datetime', 'ref_id' => 'integer', 'sort' => 'integer'];
    }

    public function days(): HasMany
    {
        return $this->hasMany(Day::class);
    }
}
