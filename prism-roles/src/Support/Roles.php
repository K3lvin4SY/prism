<?php

declare(strict_types=1);

namespace PrismRoles\Support;

use Illuminate\Database\Eloquent\Collection;
use PrismRoles\Models\Role;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\SubuserPermissionCatalog;

/** Which roles someone may use, and what a role gives a subuser. */
final class Roles
{
    public const string WEBSOCKET = 'websocket.connect';

    /** @return list<string> every permission a subuser can be given right now */
    public static function catalog(): array
    {
        return app(SubuserPermissionCatalog::class)->keys();
    }

    /**
     * The permissions the panel knows, once each and sorted; anything an extension no longer
     * offers is dropped.
     *
     * @param  array<array-key, mixed>  $permissions
     * @return list<string>
     */
    public static function clean(array $permissions): array
    {
        $known = array_flip(self::catalog());
        $kept = array_values(array_unique(array_filter($permissions, static fn ($key): bool => is_string($key) && isset($known[$key]))));
        sort($kept);

        return $kept;
    }

    /** @param  list<string>  $a  @param  list<string>  $b */
    public static function same(array $a, array $b): bool
    {
        $a = array_values(array_unique($a));
        $b = array_values(array_unique($b));
        sort($a);
        sort($b);

        return $a === $b;
    }

    /** Root admins and the server's owner may give any permission on it. */
    public static function full(User $user, Server $server): bool
    {
        return (bool) $user->root_admin || (int) $user->id === (int) $server->owner_id;
    }

    /**
     * The roles someone may use on a server: the panel-wide ones, their own, and the server
     * owner's, so the owner's helpers give the same roles.
     *
     * @return Collection<int, Role>
     */
    public static function available(User $user, Server $server): Collection
    {
        $owners = Settings::bool('personal') ? array_values(array_unique([$user->id, $server->owner_id])) : [];

        return Role::query()->with('owner')
            ->where(fn ($query) => $query->whereNull('owner_id')->when($owners !== [], fn ($query) => $query->orWhereIn('owner_id', $owners)))
            ->orderByRaw('owner_id is not null')->orderBy('name')->get();
    }

    public static function usable(Role $role, User $user, Server $server): bool
    {
        return $role->owner_id === null || (Settings::bool('personal') && in_array((int) $role->owner_id, [(int) $user->id, (int) $server->owner_id], true));
    }

    /**
     * What giving the role to the subuser comes to when `$by` gives it, as the panel's own
     * subuser form would save it: someone who is not the owner keeps permissions they do not
     * hold as they were, and never gives one they do not hold.
     *
     * @return list<string>
     */
    public static function grant(Role $role, Subuser $subuser, User $by): array
    {
        $server = $subuser->server;
        $wanted = self::clean($role->permissions);
        if (! self::full($by, $server)) {
            $held = $by->permissionsOn($server);
            $wanted = [...array_intersect($wanted, $held), ...array_diff($subuser->permissions ?? [], $held)];
        }
        $wanted = array_values(array_unique([...$wanted, self::WEBSOCKET]));
        sort($wanted);

        return $wanted;
    }

    /** Someone may give roles on a server while they may change its subusers. */
    public static function mayAssign(User $user, Server $server): bool
    {
        return self::full($user, $server) || $user->can('user.update', $server) || $user->can('user.create', $server);
    }

    /** @return array<string, mixed> */
    public static function present(Role $role, ?User $viewer = null): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'color' => $role->color,
            'permissions' => $role->permissions,
            'scope' => $role->owner_id === null ? 'panel' : ($viewer !== null && (int) $role->owner_id === (int) $viewer->id ? 'mine' : 'owner'),
            'owner' => $role->owner?->username,
            'used' => $role->assignments_count ?? null,
        ];
    }
}
