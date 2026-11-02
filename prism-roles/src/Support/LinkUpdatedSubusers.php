<?php

declare(strict_types=1);

namespace PrismRoles\Support;

use Pterodactyl\Contracts\Subusers\UpdatesSubusers;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;

/** The panel's subuser update, then the role link: a new role applied, or customised by hand. */
final readonly class LinkUpdatedSubusers implements UpdatesSubusers
{
    public function __construct(private UpdatesSubusers $inner) {}

    public function update(Server $server, Subuser $subuser, array $permissions): Subuser
    {
        $subuser = $this->inner->update($server, $subuser, $permissions);
        Links::saved($server, $subuser);

        return $subuser;
    }
}
