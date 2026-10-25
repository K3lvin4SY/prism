<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Talks to a running server through its console: Terraria servers have no query protocol,
 * so commands are sent and their replies read back from the console output Wings keeps.
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

    /** @param list<string>|string $commands */
    public function send(array|string $commands): void
    {
        Daemon::server($this->server)->commands(array_map(
            // One line each: a newline would start another command.
            static fn (string $command): string => trim((string) preg_replace('/[\r\n]+/', ' ', $command)),
            (array) $commands,
        ));
    }

    /** @return list<string> the console's recent lines, without color codes */
    public function lines(int $count = 100): array
    {
        try {
            $lines = Daemon::server($this->server)->logs($count);
        } catch (Throwable) {
            return [];
        }

        return array_values(array_map(static fn (string $line): string => trim((string) preg_replace('/\e\[[0-9;?]*[A-Za-z]|\e\][^\a]*\a|\x07/', '', $line)), $lines));
    }

    /**
     * Runs a command and returns what the server printed after it: the lines after the last
     * echo of the command, once a line matching $end shows up or the wait runs out.
     *
     * @return list<string>
     */
    public function ask(string $command, string $end, float $timeout = 3.0): array
    {
        $this->send($command);
        $deadline = microtime(true) + $timeout;

        do {
            usleep(300_000);
            $lines = $this->lines(80);
            $start = null;
            foreach ($lines as $index => $line) {
                if (preg_match('/^(?::\s*)?'.preg_quote($command, '/').'\s*$/', $line)) {
                    $start = $index;
                }
            }

            if ($start !== null) {
                $reply = array_slice($lines, $start + 1);
                foreach ($reply as $line) {
                    if (preg_match($end, $line)) {
                        return $reply;
                    }
                }
            }
        } while (microtime(true) < $deadline);

        return [];
    }
}
