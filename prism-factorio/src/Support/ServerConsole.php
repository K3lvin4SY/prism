<?php

declare(strict_types=1);

namespace PrismFactorio\Support;

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The running server's state and console. Wings keeps only the last 100 lines of output, so
 * the joins and chat are written to a file of their own (see ConsoleLog).
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

    /** Seconds since the server started, or null when it is not running. */
    public function uptime(): ?int
    {
        try {
            $details = Daemon::server($this->server)->details();
        } catch (Throwable) {
            return null;
        }
        if (! in_array($details['state'] ?? 'offline', ['running', 'starting'], true)) {
            return null;
        }

        return isset($details['utilization']['uptime']) ? intdiv((int) $details['utilization']['uptime'], 1000) : null;
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
