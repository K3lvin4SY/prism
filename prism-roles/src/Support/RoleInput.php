<?php

declare(strict_types=1);

namespace PrismRoles\Support;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PrismRoles\Models\Role;

/** A role's fields from a request, for the admin's and each user's roles alike. */
final class RoleInput
{
    /** @return array<string, mixed> */
    public static function validated(Request $request, ?Role $role): array
    {
        $required = $role ? 'sometimes' : 'required';
        $data = $request->validate([
            'name' => [$required, 'string', 'between:1,48'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'permissions' => [$required, 'array', 'max:500'],
            'permissions.*' => ['string', 'max:96'],
        ]);

        $fields = [];
        if (isset($data['name'])) {
            $fields['name'] = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $fields['description'] = trim((string) $data['description']);
        }
        if (array_key_exists('color', $data)) {
            $fields['color'] = $data['color'] === null ? null : strtolower($data['color']);
        }
        if (isset($data['permissions'])) {
            $permissions = Roles::clean($data['permissions']);
            if (array_diff($permissions, [Roles::WEBSOCKET]) === []) {
                throw ValidationException::withMessages(['permissions' => 'Pick at least one permission besides watching the console.']);
            }
            $fields['permissions'] = $permissions;
        }

        return $fields;
    }
}
