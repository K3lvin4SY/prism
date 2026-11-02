<?php

declare(strict_types=1);

namespace PrismDiscord\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;
use PrismDiscord\Models\Hook;
use PrismDiscord\Support\Discord;
use PrismDiscord\Support\Events;
use PrismDiscord\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** A server's Discord webhooks, on its "Discord" page. */
final class HooksController
{
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server);
        $hooks = Hook::query()->where('server_id', $server->id)->orderBy('id')->get();

        return response()->json(['data' => [
            'hooks' => $hooks->map(fn (Hook $hook): array => $this->present($hook))->values(),
            'events' => collect(Events::ALL)->map(static fn (array $event, string $key): array => ['key' => $key, 'label' => $event[0], 'default' => $event[1]])->values(),
            'players' => Settings::bool('players'),
            'max' => $this->max(),
        ]]);
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $user = $this->authorize($request, $server);
        abort_if(Hook::query()->where('server_id', $server->id)->count() >= $this->max(), 422, 'This server has '.$this->max().' webhooks, the most it may have. Remove one first.');
        $hook = Hook::query()->create([...$this->validated($request, null), 'server_id' => $server->id, 'user_id' => $user->id]);
        $this->log('create', $server, $hook);

        return response()->json(['data' => $this->present($hook)], 201);
    }

    public function update(Request $request, Server $server, int $hook): JsonResponse
    {
        $this->authorize($request, $server);
        $model = $this->find($server, $hook);
        $fields = $this->validated($request, $model);
        if (isset($fields['webhook'])) {
            $fields['last_error'] = null;
        }
        $model->forceFill($fields)->save();
        $this->log('update', $server, $model);

        return response()->json(['data' => $this->present($model)]);
    }

    public function destroy(Request $request, Server $server, int $hook): Response
    {
        $this->authorize($request, $server);
        $model = $this->find($server, $hook);
        $model->delete();
        $this->log('delete', $server, $model);

        return response()->noContent();
    }

    /** Sends one event now, with made-up values, and says how it went. */
    public function test(Request $request, Server $server, int $hook): JsonResponse
    {
        $this->authorize($request, $server);
        $model = $this->find($server, $hook);
        $event = $request->validate(['event' => ['sometimes', 'string', 'in:'.implode(',', array_keys(Events::ALL))]])['event'] ?? 'start';
        $result = Discord::send($model, $event, ['server' => $server->name, 'player' => 'Steve', 'backup' => 'Nightly backup']);
        abort_unless($result['ok'], 422, $result['error'] ?? 'The message was not sent.');

        return response()->json(['data' => $this->present($model->fresh())]);
    }

    private function authorize(Request $request, Server $server): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(Settings::bool('enabled'), 404, 'Discord messages are turned off on this panel.');
        abort_unless($user->can('ext.prism-discord.manage', $server), 403, 'You do not have permission to manage this server\'s Discord webhooks.');

        return $user;
    }

    private function find(Server $server, int $id): Hook
    {
        return Hook::query()->where('server_id', $server->id)->findOrFail($id);
    }

    /**
     * The hook's fields. A changed hook keeps its address when none is sent, since the page
     * never gets it back.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Hook $hook): array
    {
        $required = $hook ? 'sometimes' : 'required';
        $data = $request->validate([
            'name' => [$required, 'string', 'between:1,64'],
            'webhook' => [$hook ? 'sometimes' : 'required', 'nullable', 'string', 'max:500'],
            'events' => [$required, 'array', 'min:1'],
            'events.*' => ['string', 'in:'.implode(',', array_keys(Events::ALL))],
            'templates' => ['sometimes', 'array'],
            'templates.*' => ['nullable', 'string', 'max:1000'],
            'mention_role' => ['sometimes', 'nullable', 'string', 'regex:/^\d{5,24}$/'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $fields = [];
        if (isset($data['name'])) {
            $fields['name'] = trim($data['name']);
        }
        $webhook = trim((string) ($data['webhook'] ?? ''));
        if ($webhook !== '') {
            if (preg_match(Discord::WEBHOOK, $webhook) !== 1) {
                throw ValidationException::withMessages(['webhook' => 'That is not a Discord webhook address. In Discord: channel settings, Integrations, Webhooks, Copy Webhook URL.']);
            }
            $fields['webhook'] = Crypt::encryptString($webhook);
        }
        if (isset($data['events'])) {
            $fields['events'] = array_values(array_unique($data['events']));
        }
        if (array_key_exists('templates', $data) || $hook === null) {
            $templates = [];
            foreach ($data['templates'] ?? [] as $event => $text) {
                $text = trim((string) $text);
                if (isset(Events::ALL[$event]) && $text !== '' && $text !== Events::ALL[$event][1]) {
                    $templates[$event] = $text;
                }
            }
            $fields['templates'] = $templates;
        }
        if (array_key_exists('mention_role', $data)) {
            $fields['mention_role'] = $data['mention_role'] ?: null;
        }
        if (array_key_exists('enabled', $data)) {
            $fields['enabled'] = $data['enabled'];
        }

        return $fields;
    }

    /** @return array<string, mixed> */
    private function present(Hook $hook): array
    {
        return [
            'id' => $hook->id,
            'name' => $hook->name,
            'webhook' => $hook->masked(),
            'events' => $hook->events,
            'templates' => (object) $hook->templates,
            'mention_role' => $hook->mention_role,
            'enabled' => $hook->enabled,
            'last_sent_at' => $hook->last_sent_at?->toIso8601String(),
            'last_error' => $hook->last_error,
        ];
    }

    private function max(): int
    {
        return max(1, min(25, Settings::int('max_hooks')));
    }

    private function log(string $event, Server $server, Hook $hook): void
    {
        Activity::event('server:prism-discord.'.$event)->subject($server)->property(['webhook' => $hook->name])->log();
    }
}
