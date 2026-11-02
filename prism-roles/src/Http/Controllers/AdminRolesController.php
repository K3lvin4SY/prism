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
use Pterodactyl\Models\User;

/** The panel-wide roles, on the admin area's "Subuser roles" page. Only root admins reach it. */
final class AdminRolesController
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $roles = Role::query()->with('owner')->withCount('assignments')->whereNull('owner_id')->orderBy('name')->get();

        return response()->json(['data' => $roles->map(fn (Role $role): array => Roles::present($role, $user))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $role = Role::query()->create([...RoleInput::validated($request, null), 'owner_id' => null]);

        return response()->json(['data' => Roles::present($role->loadCount('assignments'), $request->user())], 201);
    }

    public function update(Request $request, int $role): JsonResponse
    {
        $model = Role::query()->whereNull('owner_id')->findOrFail($role);
        $model->forceFill(RoleInput::validated($request, $model))->save();
        $changed = Links::reapply($model);

        return response()->json(['data' => Roles::present($model->loadCount('assignments'), $request->user()), 'meta' => ['changed' => $changed]]);
    }

    /** Subusers who had the role keep their permissions; only the link goes. */
    public function destroy(int $role): Response
    {
        Role::query()->whereNull('owner_id')->findOrFail($role)->delete();

        return response()->noContent();
    }
}
