<?php

declare(strict_types=1);

namespace PrismStatus\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Something going on, told on the status page as a title and a series of updates.
 *
 * @property int $id
 * @property string $title
 * @property string $impact maintenance, minor or major
 * @property string $status investigating, identified, monitoring or resolved
 * @property list<int> $components
 * @property array{written: array<string, mixed>, before: array<string, mixed>}|null $announcement
 * @property CarbonImmutable|null $resolved_at
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable $updated_at
 */
class Incident extends Model
{
    public const array IMPACTS = ['maintenance', 'minor', 'major'];

    public const array STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];

    protected $table = 'prism_status_incidents';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['components' => 'array', 'announcement' => 'array', 'resolved_at' => 'immutable_datetime', 'created_at' => 'immutable_datetime', 'updated_at' => 'immutable_datetime'];
    }

    public function updates(): HasMany
    {
        return $this->hasMany(Update::class)->orderByDesc('id');
    }
}
