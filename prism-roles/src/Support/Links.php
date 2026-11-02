<?php

declare(strict_types=1);

namespace PrismRoles\Support;

use Illuminate\Support\Facades\Cache;
use PrismRoles\Models\Assignment;
use PrismRoles\Models\Role;
use Pterodactyl\Contracts\Subusers\UpdatesSubusers;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;
use Throwable;

/**
 * Keeps subusers linked to their role. The subuser form's "Apply a role" leaves a pending choice
 * for the person and server; when the panel then saves a subuser with exactly the permissions it
 * set, the subuser is linked. A later save with other permissions marks the link customised.
 */
final class Links
{
    private const int PENDING_MINUTES = 30;

    /** True while a role is being re-applied, so those saves are not taken for hand changes. */
    private static bool $applying = false;

    private static function key(User $user, Server $server): string
    {
        return sprintf('prism-roles:pending:%d:%d', $user->id, $server->id);
    }

    /** @param  list<string>  $permissions  what the form was set to */
    public static function remember(User $user, Server $server, Role $role, array $permissions): void
    {
        Cache::put(self::key($user, $server), ['role' => $role->id, 'permissions' => $permissions], now()->addMinutes(self::PENDING_MINUTES));
    }

    public static function forget(User $user, Server $server): void
    {
        Cache::forget(self::key($user, $server));
    }

    /** Called after the panel creates or updates a subuser. Never stops the save. */
    public static function saved(Server $server, Subuser $subuser): void
    {
        if (self::$applying || ! Settings::bool('enabled')) {
            return;
        }

        try {
            $user = auth()->user();
            $saved = $subuser->permissions ?? [];
            $assignment = Assignment::query()->where('subuser_id', $subuser->id)->first();

            if ($user instanceof User) {
                $pending = Cache::pull(self::key($user, $server));
                $role = is_array($pending) ? Role::query()->find($pending['role'] ?? 0) : null;
                if ($role !== null && Roles::usable($role, $user, $server) && Roles::same([...$pending['permissions'], Roles::WEBSOCKET], $saved)) {
                    Assignment::query()->updateOrCreate(['subuser_id' => $subuser->id], ['role_id' => $role->id, 'assigned_by' => $user->id, 'applied' => $saved, 'customised' => false]);

                    return;
                }
            }

            if ($assignment !== null && ! $assignment->customised && ! Roles::same($assignment->applied, $saved)) {
                $assignment->forceFill(['customised' => true])->save();
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * Gives a subuser its role's current permissions through the panel's own action, so its
     * checks, activity log and SFTP token revocation still happen.
     */
    public static function apply(Assignment $assignment, User $by): void
    {
        $subuser = $assignment->subuser;
        $permissions = Roles::grant($assignment->role, $subuser, $by);
        if (! Roles::same($permissions, $subuser->permissions ?? [])) {
            self::$applying = true;
            try {
                $subuser = app(UpdatesSubusers::class)->update($subuser->server, $subuser, $permissions);
            } finally {
                self::$applying = false;
            }
        }
        $assignment->forceFill(['applied' => $subuser->permissions, 'customised' => false, 'assigned_by' => $by->id])->save();
    }

    /**
     * After a role changes: every subuser linked to it and not customised gets its new
     * permissions, never more than whoever gave them the role still holds on that server.
     * Someone who can no longer change that server's subusers has their links left as they are.
     *
     * @return int how many subusers changed
     */
    public static function reapply(Role $role): int
    {
        $changed = 0;
        $assignments = Assignment::query()->with(['subuser.server', 'assigner', 'role'])->where('role_id', $role->id)->where('customised', false)->get();
        foreach ($assignments as $assignment) {
            $by = $assignment->assigner;
            $server = $assignment->subuser->server;
            if ($by === null || ! Roles::mayAssign($by, $server) || ! Roles::usable($role, $by, $server)) {
                continue;
            }
            $before = $assignment->subuser->permissions ?? [];
            try {
                self::apply($assignment, $by);
                $changed += Roles::same($before, $assignment->applied) ? 0 : 1;
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return $changed;
    }
}
