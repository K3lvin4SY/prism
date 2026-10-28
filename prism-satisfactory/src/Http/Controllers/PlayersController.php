<?php

declare(strict_types=1);

namespace PrismSatisfactory\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismSatisfactory\Support\Players;
use Pterodactyl\Models\Server;

/**
 * Satisfactory's dedicated server has no player list, kick or ban: the API counts who is
 * connected and the log names who joined, so this is read only.
 */
class PlayersController extends Controller
{
    /** Who is online now, everyone seen before, and the game's state from the API. */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        ['running' => $running, 'count' => $count, 'online' => $online, 'history' => $history, 'state' => $state] = Players::observe($server);

        return new JsonResponse([
            'running' => $running,
            // Null when the Panel cannot ask the API: not connected, or the server is starting.
            'count' => $count,
            'limit' => isset($state['playerLimit']) ? (int) $state['playerLimit'] : null,
            'online' => $online,
            'history' => array_values(array_map(static fn (array $player): array => $player + ['online' => in_array($player['name'], $online, true)], $history)),
            'game' => $state === null ? null : [
                'session' => (string) ($state['activeSessionName'] ?? ''),
                'running' => (bool) ($state['isGameRunning'] ?? false),
                'paused' => (bool) ($state['isGamePaused'] ?? false),
                'tier' => (int) ($state['techTier'] ?? 0),
                'phase' => (string) ($state['gamePhase'] ?? ''),
                'duration' => (int) ($state['totalGameDuration'] ?? 0),
                'tickRate' => round((float) ($state['averageTickRate'] ?? 0), 1),
            ],
        ]);
    }

    /** One player: when the Panel first and last saw them, and how often they joined. */
    public function show(Request $request, Server $server, string $player): JsonResponse
    {
        $this->authorizeFeature($request, $server, 'players', 'players-view');
        ['online' => $online, 'history' => $history] = Players::observe($server);
        $entry = $history[$player] ?? null;
        abort_if($entry === null, 404, 'This player has not been seen on this server.');

        return new JsonResponse(['player' => $entry + ['online' => in_array($player, $online, true)]]);
    }
}
