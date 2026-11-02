<?php

declare(strict_types=1);

namespace PrismQuotas\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * A server someone made through Prism Quotas.
 *
 * @property int $id
 * @property int $server_id
 * @property int $user_id
 * @property-read Server $server
 */
class QuotaServer extends Model
{
    public const null UPDATED_AT = null;

    protected $table = 'prism_quotas_servers';

    protected $guarded = ['id'];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
