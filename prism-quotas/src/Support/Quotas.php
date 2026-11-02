<?php

declare(strict_types=1);

namespace PrismQuotas\Support;

use PrismQuotas\Models\Limit;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** A person's limits, what their servers already use, and what is left. */
final class Quotas
{
    /** The least a new server may have: below this most games do not start. */
    public const array MINIMUM = ['memory' => 256, 'disk' => 1024, 'cpu' => 10];

    /** The person's own limits, or everyone's. */
    public static function limitsFor(User $user): ?Limit
    {
        return Limit::query()->where('user_id', $user->id)->first() ?? Limit::query()->whereNull('user_id')->first();
    }

    /**
     * Whether the person may create servers at all, and if not, why.
     *
     * @return array{0: bool, 1: string|null}
     */
    public static function allowed(User $user): array
    {
        if (! Settings::bool('enabled')) {
            return [false, 'Creating servers is turned off on this panel.'];
        }
        if (Settings::string('who') === 'listed' && ! Limit::query()->where('user_id', $user->id)->exists()) {
            return [false, 'Your account has no server quota. Ask an administrator for one.'];
        }

        return [true, null];
    }

    /**
     * What the servers the person owns use: all of them, however they were made.
     *
     * @return array{servers: int, memory: int, disk: int, cpu: int}
     */
    public static function usage(User $user): array
    {
        $row = Server::query()->where('owner_id', $user->id)
            ->selectRaw('count(*) as servers, coalesce(sum(memory), 0) as memory, coalesce(sum(disk), 0) as disk, coalesce(sum(cpu), 0) as cpu')
            ->toBase()->first();

        return ['servers' => (int) $row->servers, 'memory' => (int) $row->memory, 'disk' => (int) $row->disk, 'cpu' => (int) $row->cpu];
    }

    /**
     * What is left. Servers made here always have a CPU limit; one an admin made without (0) uses none.
     *
     * @return array{servers: int, memory: int, disk: int, cpu: int}
     */
    public static function remaining(Limit $limit, array $usage): array
    {
        return [
            'servers' => max(0, $limit->servers - $usage['servers']),
            'memory' => max(0, $limit->memory - $usage['memory']),
            'disk' => max(0, $limit->disk - $usage['disk']),
            'cpu' => max(0, $limit->cpu - $usage['cpu']),
        ];
    }

    /** Why a server of this size does not fit, or null when it does. */
    public static function misfit(array $remaining, int $memory, int $disk, int $cpu): ?string
    {
        return match (true) {
            $remaining['servers'] < 1 => 'You have as many servers as your quota allows. Delete one first.',
            $memory > $remaining['memory'] => "That is more memory than you have left: {$remaining['memory']} MiB.",
            $disk > $remaining['disk'] => "That is more disk than you have left: {$remaining['disk']} MiB.",
            $cpu > $remaining['cpu'] => "That is more CPU than you have left: {$remaining['cpu']}%.",
            default => null,
        };
    }
}
