<?php

declare(strict_types=1);

namespace PrismConsole\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Throwable;

/**
 * Each person's console preferences, and their command history per server, kept on the panel
 * so they follow them between browsers; and each server's quick commands, shared by everyone on it.
 */
class ConsoleController
{
    private const int MAX_PREFERENCES_BYTES = 60_000;

    private const int MAX_QUICK_COMMANDS = 30;

    private const string QUICK_TABLE = 'prism_console_quick_commands';

    public function show(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('websocket.connect', $server), 403, 'You cannot see this console.');

        return new JsonResponse([
            'preferences' => $this->store($request)->get('preferences', (object) []),
            'history' => $this->history($request, $server),
            'quickCommands' => $this->quickCommands($server),
            // The admin's current settings, so a change in Prism Properties shows without a reload.
            'config' => (object) (app(ExtensionSettingsRegistry::class)->get('prism-console')?->frontendConfig() ?? []),
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

    public function clear(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can('websocket.connect', $server), 403, 'You cannot see this console.');
        $history = ['commands' => []];
        $this->saveHistory($request, $server, $history);

        return new JsonResponse(['history' => $history]);
    }

    public function storeQuick(Request $request, Server $server): JsonResponse
    {
        $this->authorizeQuick($request, $server);
        abort_if(DB::table(self::QUICK_TABLE)->where('server_id', $server->id)->count() >= self::MAX_QUICK_COMMANDS, 422, 'This server already has '.self::MAX_QUICK_COMMANDS.' quick commands.');

        DB::table(self::QUICK_TABLE)->insert([
            ...$this->validatedQuick($request),
            'server_id' => $server->id,
            'user_id' => $request->user()->id,
            'position' => (int) DB::table(self::QUICK_TABLE)->where('server_id', $server->id)->max('position') + 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return new JsonResponse(['quickCommands' => $this->quickCommands($server)]);
    }

    public function updateQuick(Request $request, Server $server, int $command): JsonResponse
    {
        $this->authorizeQuick($request, $server);
        $row = DB::table(self::QUICK_TABLE)->where('server_id', $server->id)->where('id', $command);
        abort_unless($row->exists(), 404, 'That quick command was removed.');
        $row->update([...$this->validatedQuick($request), 'updated_at' => now()]);

        return new JsonResponse(['quickCommands' => $this->quickCommands($server)]);
    }

    public function destroyQuick(Request $request, Server $server, int $command): JsonResponse
    {
        $this->authorizeQuick($request, $server);
        DB::table(self::QUICK_TABLE)->where('server_id', $server->id)->where('id', $command)->delete();

        return new JsonResponse(['quickCommands' => $this->quickCommands($server)]);
    }

    private function authorizeQuick(Request $request, Server $server): void
    {
        abort_unless($request->user()->can('control.console', $server), 403, 'You cannot send commands to this server.');
    }

    /** @return array{label: string|null, command: string, confirm: bool} */
    private function validatedQuick(Request $request): array
    {
        $data = $request->validate(['label' => ['nullable', 'string', 'max:48'], 'command' => ['required', 'string', 'max:1000'], 'confirm' => ['sometimes', 'boolean']]);
        $label = trim((string) ($data['label'] ?? ''));

        return ['label' => $label === '' ? null : $label, 'command' => trim($data['command']), 'confirm' => (bool) ($data['confirm'] ?? false)];
    }

    /** @return list<array{id: int, label: string|null, command: string, confirm: bool}> */
    private function quickCommands(Server $server): array
    {
        return DB::table(self::QUICK_TABLE)
            ->where('server_id', $server->id)
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'label', 'command', 'confirm'])
            ->map(static fn (object $row): array => ['id' => (int) $row->id, 'label' => $row->label, 'command' => $row->command, 'confirm' => (bool) $row->confirm])
            ->all();
    }

    /** @return array{commands: list<string>} */
    private function history(Request $request, Server $server): array
    {
        $stored = $this->store($request)->get('history.'.$server->uuid);

        return ['commands' => array_values(array_filter(is_array($stored['commands'] ?? null) ? $stored['commands'] : [], 'is_string'))];
    }

    /**
     * Keeps anything else stored with the history, such as pinned commands from before.
     *
     * @param array{commands: list<string>} $history
     */
    private function saveHistory(Request $request, Server $server, array $history): void
    {
        $stored = $this->store($request)->get('history.'.$server->uuid);
        $this->store($request)->set('history.'.$server->uuid, [...(is_array($stored) ? $stored : []), ...$history]);
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
