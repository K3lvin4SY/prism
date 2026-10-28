<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The running server's state. The Satisfactory server does not read commands from its console,
 * so everything it is asked goes through its HTTPS API (see ServerApi).
 */
final class ServerConsole
{
    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public function isRunning(): bool
    {
        try {
            return in_array(Daemon::server($this->server)->details()['state'] ?? 'offline', ['running', 'starting'], true);
        } catch (Throwable) {
            return false;
        }
    }
}
