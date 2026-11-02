<?php

declare(strict_types=1);

namespace PrismNodes\Support;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use PrismNodes\Models\Move;
use Pterodactyl\Contracts\Transfers\InitiatesTransfers;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerTransfer;
use Throwable;

/**
 * Moves queued servers to their new node one at a time, through the panel's own transfer: the
 * next starts once the one before has finished, so a node is never flooded with archives.
 */
final class Mover
{
    /** A transfer still unfinished after this long is given up on here; the panel's own record stays. */
    private const int GIVE_UP_HOURS = 12;

    public static function step(): void
    {
        $moving = Move::query()->where('status', 'moving')->first();
        if ($moving !== null) {
            self::follow($moving);
            if ($moving->status === 'moving') {
                return;
            }
        }

        $next = Move::query()->with(['server.allocations', 'toNode'])->where('status', 'queued')->orderBy('id')->first();
        if ($next !== null) {
            self::start($next);
        }
    }

    /** Free addresses on the node for a server: its own ports when they are free there, else any. */
    public static function allocationsFor(Server $server, Node $node): ?Collection
    {
        $needed = max(1, $server->allocations->count());
        $free = Allocation::query()->where('node_id', $node->id)->whereNull('server_id')->orderBy('port')->get();
        if ($free->count() < $needed) {
            return null;
        }

        // The primary port first, so it stays the primary one.
        $ports = $server->allocations->sortBy(static fn (Allocation $allocation): int => $allocation->id === $server->allocation_id ? 0 : 1)->pluck('port');
        if ($ports->isEmpty()) {
            $ports = collect([null]);
        }

        $picked = collect();
        foreach ($ports as $port) {
            $choice = $free->first(static fn (Allocation $allocation): bool => $allocation->port === $port) ?? $free->first();
            $picked->push($choice);
            $free = $free->reject(static fn (Allocation $allocation): bool => $allocation->id === $choice->id)->values();
        }

        return $picked->values();
    }

    private static function start(Move $move): void
    {
        $server = $move->server;
        $node = $move->toNode;
        $fail = static fn (string $why) => $move->forceFill(['status' => 'failed', 'error' => mb_strimwidth($why, 0, 500, '…'), 'finished_at' => now()])->save();

        if ($server->node_id === $node->id) {
            $move->forceFill(['status' => 'done', 'finished_at' => now()])->save();

            return;
        }
        if (! $node->isViable($server->memory, $server->disk)) {
            $fail("{$node->name} does not have room for its memory and disk.");

            return;
        }
        $allocations = self::allocationsFor($server, $node);
        if ($allocations === null) {
            $fail("{$node->name} does not have enough free ports: it needs ".max(1, $server->allocations->count()).'.');

            return;
        }

        try {
            $transfer = app(InitiatesTransfers::class)->initiate($server, $node, $allocations->first()->id, $allocations->slice(1)->pluck('id')->values()->all());
        } catch (ValidationException $exception) {
            $fail(implode(' ', $exception->validator->errors()->all()));

            return;
        } catch (Throwable $exception) {
            report($exception);
            $fail($exception->getMessage());

            return;
        }

        $move->forceFill(['status' => 'moving', 'transfer_id' => $transfer->id, 'started_at' => now(), 'from_node_id' => $server->node_id])->save();

        $log = Activity::event('admin:server.transfer')->subject($server)->property(['node' => $node->name, 'via' => 'Prism Nodes']);
        if ($move->requester !== null) {
            $log = $log->actor($move->requester);
        }
        $log->log();
    }

    /** Has the panel's transfer finished? */
    private static function follow(Move $move): void
    {
        $transfer = $move->transfer_id !== null ? ServerTransfer::query()->find($move->transfer_id) : null;
        if ($transfer === null) {
            $move->forceFill(['status' => 'failed', 'error' => 'The transfer record is gone.', 'finished_at' => now()])->save();

            return;
        }

        if ($transfer->successful === true) {
            $move->forceFill(['status' => 'done', 'finished_at' => now()])->save();
        } elseif ($transfer->successful === false) {
            $move->forceFill(['status' => 'failed', 'error' => 'The nodes could not finish the transfer. The server stays where it was.', 'finished_at' => now()])->save();
        } elseif ($move->started_at !== null && $move->started_at->lessThan(now()->subHours(self::GIVE_UP_HOURS))) {
            $move->forceFill(['status' => 'failed', 'error' => 'Still not finished after '.self::GIVE_UP_HOURS.' hours. Check it on the server\'s admin page.', 'finished_at' => now()])->save();
        }
    }
}
