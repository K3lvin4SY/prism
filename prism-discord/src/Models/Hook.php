<?php

declare(strict_types=1);

namespace PrismDiscord\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

/**
 * A Discord webhook one server posts its events to.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $user_id who added it
 * @property string $name
 * @property string $webhook encrypted; read it with address()
 * @property list<string> $events keys of Events::ALL
 * @property array<string, string> $templates message text by event, where it differs from the default
 * @property string|null $mention_role a Discord role id to mention
 * @property bool $enabled
 * @property \Illuminate\Support\Carbon|null $last_sent_at
 * @property string|null $last_error
 * @property-read Server $server
 * @property-read User|null $user
 */
class Hook extends Model
{
    protected $table = 'prism_discord_hooks';

    protected $guarded = ['id'];

    protected $hidden = ['webhook'];

    protected $casts = [
        'events' => 'array',
        'templates' => 'array',
        'enabled' => 'boolean',
        'last_sent_at' => 'datetime',
    ];

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The webhook address, or null when it can no longer be decrypted (the app key changed). */
    public function address(): ?string
    {
        try {
            return Crypt::decryptString($this->webhook);
        } catch (Throwable) {
            return null;
        }
    }

    /** "https://discord.com/api/webhooks/1234…/…cdef", to show which webhook it is without giving it away. */
    public function masked(): string
    {
        $address = $this->address();
        if ($address === null || preg_match('#/webhooks/(\d+)/([\w-]+)$#', $address, $match) !== 1) {
            return '';
        }

        return sprintf('…/webhooks/%s…/…%s', substr($match[1], 0, 4), substr($match[2], -4));
    }
}
