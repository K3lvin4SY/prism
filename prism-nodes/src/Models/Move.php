<?php

declare(strict_types=1);

namespace PrismNodes\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * A server to move to another node.
 *
 * @property int $id
 * @property int $server_id
 * @property int $from_node_id
 * @property int $to_node_id
 * @property int|null $requested_by
 * @property string $status queued, moving, done, failed or cancelled
 * @property int|null $transfer_id
 * @property string|null $error
 * @property CarbonImmutable|null $started_at
 * @property CarbonImmutable|null $finished_at
 * @property CarbonImmutable $created_at
 * @property-read Server $server
 * @property-read Node $toNode
 * @property-read User|null $requester
 */
class Move extends Model
{
    protected $table = 'prism_nodes_moves';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime', 'finished_at' => 'immutable_datetime', 'created_at' => 'immutable_datetime', 'updated_at' => 'immutable_datetime'];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function fromNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'from_node_id');
    }

    public function toNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'to_node_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
