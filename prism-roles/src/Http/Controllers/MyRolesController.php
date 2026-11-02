<?php

declare(strict_types=1);

namespace PrismRoles\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismRoles\Models\Role;
use PrismRoles\Support\Links;
use PrismRoles\Support\RoleInput;
use PrismRoles\Support\Roles;
use PrismRoles\Support\Settings;
use Pterodactyl\Models\User;

/** A user's own roles, on their account's "Subuser roles" page, beside the panel-wide ones. */
final class MyRolesController
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request, false);
        $roles = Role::query()->with('owner')->withCount('assignments')
            ->where(fn ($query) => $query->whereNull('owner_id')->orWhere('owner_id', $user->id))
            ->orderByRaw('owner_id is null')->orderBy('name')->get();

        return response()->json(['data' => [
            'roles' => $roles->map(fn (Role $role): array => Roles::present($role, $user))->values(),
            'personal' => Settings::bool('personal'),
            'max' => $this->max(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request, true);
        abort_if(Role::query()->where('owner_id', $user->id)->count() >= $this->max(), 422, 'You have '.$this->max().' roles, the most you may save. Delete one first.');
        $role = Role::query()->create([...RoleInput::validated($request, null), 'owner_id' => $user->id]);

        return response()->json(['data' => Roles::present($role->loadCount('assignments'), $user)], 201);
    }

    public function update(Request $request, int $role): JsonResponse
    {
        $user = $this->user($request, true);
        $model = Role::query()->where('owner_id', $user->id)->findOrFail($role);
        $model->forceFill(RoleInput::validated($request, $model))->save();
        $changed = Links::reapply($model);

        return response()->json(['data' => Roles::present($model->loadCount('assignments'), $user), 'meta' => ['changed' => $changed]]);
    }

    public function destroy(Request $request, int $role): Response
    {
        $user = $this->user($request, false);
        Role::query()->where('owner_id', $user->id)->findOrFail($role)->delete();

        return response()->noContent();
    }

    private function user(Request $request, bool $saving): User
    {
        abort_unless(Settings::bool('enabled'), 404, 'Subuser roles are turned off on this panel.');
        abort_if($saving && ! Settings::bool('personal'), 403, 'Your administrator only allows the panel-wide roles.');

        return $request->user();
    }

    private function max(): int
    {
        return max(1, min(100, Settings::int('max_personal')));
    }
}
