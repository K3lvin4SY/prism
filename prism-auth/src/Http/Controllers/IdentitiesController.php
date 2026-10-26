<?php

declare(strict_types=1);

namespace PrismAuth\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismAuth\Models\AuthProvider;
use PrismAuth\Models\Identity;
use PrismAuth\Support\Accounts;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;

/** The signed-in person's sign-in methods, on their account page. */
final class IdentitiesController
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $identities = Identity::query()->with('provider')->where('user_id', $user->id)->get()->keyBy('provider_id');
        $providers = AuthProvider::query()->orderBy('sort')->orderBy('id')->get()
            ->filter(fn (AuthProvider $provider): bool => $provider->enabled || $identities->has($provider->id));

        return response()->json(['data' => [
            'password' => ! Accounts::passwordless($user),
            'methods' => Accounts::methods($user),
            'providers' => $providers->map(function (AuthProvider $provider) use ($identities): array {
                $identity = $identities->get($provider->id);

                return [
                    ...$provider->toPublic(),
                    'enabled' => $provider->enabled,
                    'identity' => $identity === null ? null : [
                        'id' => $identity->id,
                        'name' => $identity->display_name,
                        'email' => $identity->email,
                        'avatar' => $identity->avatar,
                        'linked_at' => $identity->created_at->toIso8601String(),
                        'last_used_at' => $identity->last_used_at?->toIso8601String(),
                    ],
                ];
            })->values(),
        ]]);
    }

    public function destroy(Request $request, int $identity): Response
    {
        /** @var User $user */
        $user = $request->user();
        $model = Identity::query()->with('provider')->where('user_id', $user->id)->findOrFail($identity);

        if (Accounts::methods($user) <= 1) {
            abort(422, 'This is your only way to sign in. Set a password or link another provider first.');
        }

        $model->delete();
        Activity::event('user:prism-auth.unlink')->subject($user)->property(['provider' => $model->provider->name])->log();

        return response()->noContent();
    }
}
