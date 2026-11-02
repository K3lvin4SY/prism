<?php

declare(strict_types=1);

namespace PrismQuotas\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Egg;

/**
 * An egg people may pick when they create a server.
 *
 * @property int $id
 * @property int $egg_id
 * @property string $label
 * @property string $description
 * @property string $image
 * @property list<int> $locations empty for every location
 * @property int $sort
 * @property-read Egg $egg
 */
class Offer extends Model
{
    protected $table = 'prism_quotas_offers';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['locations' => 'array', 'sort' => 'integer', 'egg_id' => 'integer'];
    }

    public function egg(): BelongsTo
    {
        return $this->belongsTo(Egg::class);
    }
}
