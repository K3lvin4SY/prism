<?php

declare(strict_types=1);

namespace PrismTweaks\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\User;

/**
 * Users for the per-user limits list in Prism Properties: a search to add someone, and the
 * names of those already on the list. Admin API routes reach root admins only.
 */
class UsersController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'ids' => ['nullable', 'string', 'max:4000'],
        ]);

        $query = User::query()->orderBy('username');
        if (isset($data['ids'])) {
            $ids = array_values(array_filter(array_map('intval', explode(',', $data['ids'])), static fn (int $id): bool => $id > 0));
            $query->whereKey(array_slice($ids, 0, 500));
        } else {
            $search = trim((string) ($data['search'] ?? ''));
            if ($search !== '') {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn ($where) => $where->where('username', 'like', $like)->orWhere('email', 'like', $like)->orWhere('name_first', 'like', $like)->orWhere('name_last', 'like', $like));
            }
            $query->limit(20);
        }

        return new JsonResponse(['data' => $query->get()->map(static fn (User $user): array => [
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'root_admin' => (bool) $user->root_admin,
        ])->values()]);
    }
}
