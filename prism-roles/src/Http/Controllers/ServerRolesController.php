<?php

declare(strict_types=1);

namespace PrismRoles\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismRoles\Models\Assignment;
use PrismRoles\Models\Role;
use PrismRoles\Support\Links;
use PrismRoles\Support\Roles;
use PrismRoles\Support\Settings;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;

/** Roles on a server's Users page: the role picker on the subuser form and each subuser's role. */
final class ServerRolesController
{
    public function roles(Request $request, Server $server): JsonResponse
    {
        $user = $this->user($request, $server, 'user.read');

        return response()->json(['data' => Roles::available($user, $server)->map(fn (Role $role): array => Roles::present($role, $user))->values()]);
    }

    /** The role just applied on the subuser form; the next save with its permissions links it. */
    public function pending(Request $request, Server $server): Response
    {
        $user = $this->assigner($request, $server);
        $data = $request->validate(['role' => ['required', 'integer'], 'permissions' => ['present', 'array', 'max:500'], 'permissions.*' => ['string', 'max:96']]);
        $role = Role::query()->findOrFail($data['role']);
        abort_unless(Roles::usable($role, $user, $server), 404, 'That role cannot be used on this server.');
        Links::remember($user, $server, $role, array_values($data['permissions']));

        return response()->noContent();
    }

    public function forgetPending(Request $request, Server $server): Response
    {
        Links::forget($this->assigner($request, $server), $server);

        return response()->noContent();
    }

    public function assignments(Request $request, Server $server): JsonResponse
    {
        $this->user($request, $server, 'user.read');
        $assignments = Assignment::query()->with(['role', 'subuser.user'])
            ->whereIn('subuser_id', Subuser::query()->where('server_id', $server->id)->select('id'))->get();

        return response()->json(['data' => $assignments->map(static fn (Assignment $assignment): array => [
            'subuser' => $assignment->subuser->user->uuid,
            'username' => $assignment->subuser->user->username,
            'role' => ['id' => $assignment->role->id, 'name' => $assignment->role->name, 'color' => $assignment->role->color],
            'customised' => $assignment->customised,
            'current' => Roles::same($assignment->applied, $assignment->subuser->permissions ?? []) && Roles::same(Roles::clean([...$assignment->role->permissions, Roles::WEBSOCKET]), Roles::clean($assignment->applied)),
        ])->values()]);
    }

    /** Gives the subuser their role's permissions again, and links them again if they were customised. */
    public function reapply(Request $request, Server $server, string $subuser): JsonResponse
    {
        $user = $this->assigner($request, $server);
        $assignment = $this->find($server, $subuser);
        abort_unless(Roles::usable($assignment->role, $user, $server), 403, 'You cannot use that role on this server.');
        abort_if((int) $assignment->subuser->user_id === (int) $user->id, 403, 'You cannot change your own permissions.');
        Links::apply($assignment, $user);
        Activity::event('server:prism-roles.apply')->subject($server)->property(['role' => $assignment->role->name, 'email' => $assignment->subuser->user->email])->log();

        return response()->json(['data' => ['customised' => false]]);
    }

    /** Ends the link; the subuser keeps the permissions they have. */
    public function unlink(Request $request, Server $server, string $subuser): Response
    {
        $this->assigner($request, $server);
        $this->find($server, $subuser)->delete();

        return response()->noContent();
    }

    private function user(Request $request, Server $server, string $permission): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(Settings::bool('enabled'), 404, 'Subuser roles are turned off on this panel.');
        abort_unless(Roles::full($user, $server) || $user->can($permission, $server), 403, 'You do not have permission to see this server\'s subusers.');

        return $user;
    }

    private function assigner(Request $request, Server $server): User
    {
        $user = $this->user($request, $server, 'user.read');
        abort_unless(Roles::mayAssign($user, $server), 403, 'You do not have permission to change this server\'s subusers.');

        return $user;
    }

    /** By the subuser's user uuid, as the panel's own subuser routes name them. */
    private function find(Server $server, string $uuid): Assignment
    {
        $subuser = Subuser::query()->where('server_id', $server->id)->whereHas('user', fn ($query) => $query->where('uuid', $uuid))->firstOrFail();

        return Assignment::query()->with(['role', 'subuser.user', 'subuser.server'])->where('subuser_id', $subuser->id)->firstOrFail();
    }
}
