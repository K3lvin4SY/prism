<?php

declare(strict_types=1);

namespace PrismConsole\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Each person's console preferences, and their command history per server, kept on the panel
 * so they follow them between browsers.
 */
class ConsoleController
{
    private const int MAX_PREFERENCES_BYTES = 60_000;

    public function show(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('websocket.connect', $server), 403, 'You cannot see this console.');

        return new JsonResponse([
            'preferences' => $this->store($request)->get('preferences', (object) []),
            'history' => $this->history($request, $server),
        ]);
    }

    public function preferences(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('websocket.connect', $server), 403, 'You cannot see this console.');
        $data = $request->validate(['preferences' => ['present', 'array']]);
        abort_if(strlen((string) json_encode($data['preferences'])) > self::MAX_PREFERENCES_BYTES, 422, 'Those preferences are too large to save.');

        $this->store($request)->set('preferences', $data['preferences']);

        return new JsonResponse(['preferences' => $data['preferences']]);
    }

    /** Adds a sent command to the top of the history; a repeat moves to the top. */
    public function record(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('control.console', $server), 403, 'You cannot send commands to this server.');
        $command = trim((string) $request->validate(['command' => ['required', 'string', 'max:1000']])['command']);

        $history = $this->history($request, $server);
        $history['commands'] = array_slice([$command, ...array_values(array_filter($history['commands'], static fn (string $item): bool => $item !== $command))], 0, $this->limit());
        $this->saveHistory($request, $server, $history);

        return new JsonResponse(['history' => $history]);
    }

    public function pin(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('control.console', $server), 403, 'You cannot send commands to this server.');
        $data = $request->validate(['command' => ['required', 'string', 'max:1000'], 'pinned' => ['required', 'boolean']]);

        $history = $this->history($request, $server);
        $pinned = array_values(array_filter($history['pinned'], static fn (string $item): bool => $item !== $data['command']));
        $history['pinned'] = $data['pinned'] ? array_slice([$data['command'], ...$pinned], 0, 50) : $pinned;
        $this->saveHistory($request, $server, $history);

        return new JsonResponse(['history' => $history]);
    }

    /** Forgets the history; pinned commands stay. */
    public function clear(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('websocket.connect', $server), 403, 'You cannot see this console.');
        $history = ['commands' => [], 'pinned' => $this->history($request, $server)['pinned']];
        $this->saveHistory($request, $server, $history);

        return new JsonResponse(['history' => $history]);
    }

    /** @return array{commands: list<string>, pinned: list<string>} */
    private function history(Request $request, Server $server): array
    {
        $stored = $this->store($request)->get('history.'.$server->uuid);

        return [
            'commands' => array_values(array_filter(is_array($stored['commands'] ?? null) ? $stored['commands'] : [], 'is_string')),
            'pinned' => array_values(array_filter(is_array($stored['pinned'] ?? null) ? $stored['pinned'] : [], 'is_string')),
        ];
    }

    /** @param array{commands: list<string>, pinned: list<string>} $history */
    private function saveHistory(Request $request, Server $server, array $history): void
    {
        $this->store($request)->set('history.'.$server->uuid, $history);
    }

    private function store(Request $request): ExtensionSettings
    {
        return (new ExtensionSettings('prism-console'))->forUser($request->user());
    }

    private function limit(): int
    {
        try {
            return max(10, min(500, (int) (app(ExtensionSettingsRegistry::class)->get('prism-console')?->get('history_limit') ?? 50)));
        } catch (Throwable) {
            return 50;
        }
    }
}
