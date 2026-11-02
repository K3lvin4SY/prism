<?php

declare(strict_types=1);

namespace PrismNodes\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * What one node's servers used at one moment.
 *
 * @property int $id
 * @property int $node_id
 * @property CarbonImmutable $taken_at
 * @property float $cpu percent of one thread, added up over the servers
 * @property int $memory_bytes
 * @property int $disk_bytes
 * @property int $running
 */
class Sample extends Model
{
    public $timestamps = false;

    protected $table = 'prism_nodes_samples';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['taken_at' => 'immutable_datetime', 'cpu' => 'float', 'memory_bytes' => 'integer', 'disk_bytes' => 'integer', 'running' => 'integer'];
    }
}
