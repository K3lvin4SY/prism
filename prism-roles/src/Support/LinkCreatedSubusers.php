<?php

declare(strict_types=1);

namespace PrismRoles\Support;

use Pterodactyl\Contracts\Subusers\CreatesSubusers;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;

/** The panel's subuser creation, then the role link if a role was applied on the form. */
final readonly class LinkCreatedSubusers implements CreatesSubusers
{
    public function __construct(private CreatesSubusers $inner) {}

    public function create(Server $server, string $email, array $permissions): Subuser
    {
        $subuser = $this->inner->create($server, $email, $permissions);
        Links::saved($server, $subuser);

        return $subuser;
    }
}
