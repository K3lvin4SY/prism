<?php

declare(strict_types=1);

namespace PrismShare\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PrismShare\Models\Link;
use PrismShare\Support\Capabilities;
use PrismShare\Support\Links;
use PrismShare\Support\Settings;
use PrismShare\Support\SharePath;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * A server's share links, on its "Share links" page. Whoever saves a link vouches for it: every
 * option on it must be one they may give, and from then on it is limited to what they may do.
 */
final class LinksController
{
    /** Links one server may have open at once. */
    private const int MAX_ACTIVE = 25;

    public function index(Request $request, Server $server): JsonResponse
    {
        $user = $this->authorize($request, $server);
        $links = Link::query()->with(['user', 'server'])->where('server_id', $server->id)
            ->where(fn ($query) => $query->whereNull('revoked_at')->orWhere('revoked_at', '>', now()->subDays(7)))
            ->orderByDesc('id')->get();

        return response()->json(['data' => [
            'links' => $links->map($this->present(...))->values(),
            'grantable' => $grantable = Capabilities::grantable($user, $server),
            'max_hours' => $this->maxHours(),
            // The backups that can be picked, only for someone who may share backups.
            'backups' => $grantable['backups'] !== null ? [] : Backup::query()->where('server_id', $server->id)->where('is_successful', true)->whereNotNull('completed_at')
                ->orderByDesc('completed_at')->get()
                ->map(static fn (Backup $backup): array => ['uuid' => $backup->uuid, 'name' => $backup->name, 'size' => $backup->bytes, 'completed_at' => $backup->completed_at?->toIso8601String()])->values(),
        ]]);
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $user = $this->authorize($request, $server);
        abort_if(Link::query()->where('server_id', $server->id)->whereNull('revoked_at')->where('expires_at', '>', now())->count() >= self::MAX_ACTIVE, 422, 'This server has '.self::MAX_ACTIVE.' open links. Revoke one first.');

        $data = $this->validated($request, $user, $server, null);
        [$token, $hash] = Links::token();
        $link = Link::query()->create([...$data, 'uuid' => (string) Str::uuid(), 'server_id' => $server->id, 'user_id' => $user->id, 'token_hash' => $hash]);
        $this->log('create', $server, $link);

        // The only time the token is shown: only its hash is kept.
        return response()->json(['data' => [...$this->present($link->load(['user', 'server'])), 'token' => $token]], 201);
    }

    public function update(Request $request, Server $server, int $link): JsonResponse
    {
        $user = $this->authorize($request, $server);
        $model = $this->find($server, $link);
        abort_unless($model->active(), 422, 'This link has expired or was revoked. Make a new one.');

        $model->forceFill([...$this->validated($request, $user, $server, $model), 'user_id' => $user->id])->save();
        Links::disconnect($model);
        $this->log('update', $server, $model);

        return response()->json(['data' => $this->present($model->load(['user', 'server']))]);
    }

    public function destroy(Request $request, Server $server, int $link): Response
    {
        $this->authorize($request, $server);
        $model = $this->find($server, $link);
        if ($model->revoked_at === null) {
            $model->forceFill(['revoked_at' => now()])->save();
            Links::disconnect($model);
            $this->log('revoke', $server, $model);
        }

        return response()->noContent();
    }

    private function authorize(Request $request, Server $server): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(Settings::bool('enabled'), 404, 'Share links are turned off on this panel.');
        abort_unless($user->can('ext.prism-share.manage', $server), 403, 'You do not have permission to manage share links.');

        return $user;
    }

    private function find(Server $server, int $id): Link
    {
        return Link::query()->where('server_id', $server->id)->findOrFail($id);
    }

    /**
     * The link's fields from the request. Every option must be one this user may give; paths and
     * backups are checked against the server.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, User $user, Server $server, ?Link $link): array
    {
        $data = $request->validate([
            'label' => [$link ? 'sometimes' : 'required', 'string', 'between:1,64'],
            'permissions' => [$link ? 'sometimes' : 'required', 'array', 'max:'.count(Capabilities::OPTIONS)],
            'permissions.*' => ['string', 'in:'.implode(',', array_keys(Capabilities::OPTIONS))],
            'paths' => ['sometimes', 'array', 'max:20'],
            'paths.*' => ['string', 'max:512'],
            'backups' => ['sometimes', 'array', 'max:50'],
            'backups.*' => ['string', 'uuid'],
            'hours' => [$link ? 'sometimes' : 'required', 'integer', 'min:1', 'max:'.$this->maxHours()],
        ]);

        $options = Capabilities::clean($data['permissions'] ?? $link?->permissions ?? []);
        if ($options === []) {
            throw ValidationException::withMessages(['permissions' => 'Pick at least one thing the link allows.']);
        }
        // Also the options a link already had: whoever saves it must be able to give all of them.
        $grantable = Capabilities::grantable($user, $server);
        foreach ($options as $option) {
            if ($grantable[$option] !== null) {
                throw ValidationException::withMessages(['permissions' => sprintf('You cannot give "%s": %s', $option, $grantable[$option])]);
            }
        }

        $paths = [];
        foreach ($data['paths'] ?? $link?->paths ?? [] as $path) {
            $normal = SharePath::normalize($path) ?? throw ValidationException::withMessages(['paths' => sprintf('"%s" is not a path on the server.', $path)]);
            $paths[$normal] = $normal;
        }
        $paths = in_array('files', $options, true) ? array_values($paths) : [];
        if (in_array('files', $options, true) && $paths === []) {
            throw ValidationException::withMessages(['paths' => 'Add at least one folder or file to share.']);
        }

        $backups = in_array('backups', $options, true) ? array_values(array_unique($data['backups'] ?? $link?->backups ?? [])) : [];
        if (in_array('backups', $options, true)) {
            $found = Backup::query()->where('server_id', $server->id)->whereIn('uuid', $backups)->where('is_successful', true)->count();
            if ($backups === [] || $found !== count($backups)) {
                throw ValidationException::withMessages(['backups' => 'Pick finished backups of this server to share.']);
            }
        }

        $fields = ['permissions' => $options, 'paths' => $paths, 'backups' => $backups];
        if (isset($data['label'])) {
            $fields['label'] = trim($data['label']);
        }
        if (isset($data['hours'])) {
            $fields['expires_at'] = now()->addHours((int) $data['hours']);
        }

        return $fields;
    }

    /** @return array<string, mixed> */
    private function present(Link $link): array
    {
        return [
            'id' => $link->id,
            'label' => $link->label,
            'permissions' => $link->permissions,
            'effective' => $link->active() ? Capabilities::effective($link) : [],
            'paths' => $link->paths,
            'backups' => $link->backups,
            'expires_at' => $link->expires_at->toIso8601String(),
            'revoked_at' => $link->revoked_at?->toIso8601String(),
            'last_used_at' => $link->last_used_at?->toIso8601String(),
            'uses' => $link->uses,
            'active' => $link->active(),
            'by' => $link->user->username,
            'created_at' => $link->created_at->toIso8601String(),
        ];
    }

    private function maxHours(): int
    {
        return max(1, min(720, Settings::int('max_hours')));
    }

    private function log(string $event, Server $server, Link $link): void
    {
        Activity::event('server:prism-share.'.$event)->subject($server)->property(['link' => $link->label, 'allows' => implode(', ', $link->permissions)])->log();
    }
}
