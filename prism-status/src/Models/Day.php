<?php

declare(strict_types=1);

namespace PrismStatus\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Minutes checked and minutes up for one component on one day.
 *
 * @property int $id
 * @property int $component_id
 * @property string $day Y-m-d
 * @property int $checks
 * @property int $up
 */
class Day extends Model
{
    public $timestamps = false;

    protected $table = 'prism_status_days';

    protected $guarded = ['id'];
}
