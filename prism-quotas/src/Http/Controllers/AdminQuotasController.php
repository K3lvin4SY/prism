<?php

declare(strict_types=1);

namespace PrismQuotas\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use PrismQuotas\Models\Limit;
use PrismQuotas\Models\Offer;
use PrismQuotas\Support\Quotas;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\User;

/** The admin "Quotas" page: limits for everyone and for some, and the eggs on offer. Only root admins reach it. */
final class AdminQuotasController
{
    public function overview(): JsonResponse
    {
        $default = Limit::query()->whereNull('user_id')->firstOrCreate(['user_id' => null]);
        $overrides = Limit::query()->with('user')->whereNotNull('user_id')->get()->sortBy(static fn (Limit $limit): string => (string) $limit->user?->username);

        return response()->json(['data' => [
            'default' => $default->values(),
            'users' => $overrides->map(static fn (Limit $limit): array => [
                'user' => ['id' => $limit->user_id, 'username' => $limit->user?->username, 'email' => $limit->user?->email],
                'limits' => $limit->values(),
                'usage' => $limit->user !== null ? Quotas::usage($limit->user) : null,
            ])->values(),
            'offers' => Offer::query()->with('egg')->orderBy('sort')->orderBy('id')->get()->map(self::offer(...))->values(),
            'eggs' => Egg::query()->orderBy('name')->get()->map(static fn (Egg $egg): array => ['id' => $egg->id, 'name' => $egg->name, 'images' => (object) ($egg->docker_images ?? [])])->values(),
            'locations' => Location::query()->orderBy('short')->get()->map(static fn (Location $location): array => ['id' => $location->id, 'name' => $location->short, 'description' => $location->long])->values(),
        ]]);
    }

    public function saveDefault(Request $request): JsonResponse
    {
        $limit = Limit::query()->whereNull('user_id')->firstOrCreate(['user_id' => null]);
        $limit->forceFill(self::limits($request))->save();

        return response()->json(['data' => $limit->values()]);
    }

    public function saveUser(Request $request, int $user): JsonResponse
    {
        $model = User::query()->findOrFail($user);
        $limit = Limit::query()->updateOrCreate(['user_id' => $model->id], self::limits($request));

        return response()->json(['data' => $limit->values()]);
    }

    /** The person falls back to everyone's limits. Their servers stay. */
    public function removeUser(int $user): Response
    {
        Limit::query()->where('user_id', $user)->delete();

        return response()->noContent();
    }

    public function users(Request $request): JsonResponse
    {
        $q = '%'.addcslashes(trim((string) $request->query('q', '')), '%_\\').'%';
        $users = User::query()->where(static fn ($query) => $query->where('username', 'like', $q)->orWhere('email', 'like', $q))->orderBy('username')->limit(10)->get();

        return response()->json(['data' => $users->map(static fn (User $user): array => ['id' => $user->id, 'username' => $user->username, 'email' => $user->email])->values()]);
    }

    public function storeOffer(Request $request): JsonResponse
    {
        $offer = Offer::query()->create([...self::offerInput($request), 'sort' => (int) Offer::query()->max('sort') + 1]);

        return response()->json(['data' => self::offer($offer->load('egg'))], 201);
    }

    public function updateOffer(Request $request, int $offer): JsonResponse
    {
        $model = Offer::query()->findOrFail($offer);
        $model->forceFill(self::offerInput($request))->save();

        return response()->json(['data' => self::offer($model->load('egg'))]);
    }

    /** People stop seeing it; servers already made with it stay. */
    public function destroyOffer(int $offer): Response
    {
        Offer::query()->findOrFail($offer)->delete();

        return response()->noContent();
    }

    /** @return array<string, int> */
    private static function limits(Request $request): array
    {
        return array_map('intval', $request->validate([
            'servers' => ['required', 'integer', 'min:0', 'max:1000'],
            'memory' => ['required', 'integer', 'min:0', 'max:16777216'],
            'disk' => ['required', 'integer', 'min:0', 'max:1073741824'],
            'cpu' => ['required', 'integer', 'min:0', 'max:100000'],
            'backups' => ['required', 'integer', 'min:0', 'max:1000'],
            'databases' => ['required', 'integer', 'min:0', 'max:1000'],
            'allocations' => ['required', 'integer', 'min:1', 'max:100'],
        ]));
    }

    private static function offerInput(Request $request): array
    {
        $data = $request->validate([
            'egg_id' => ['required', 'integer', Rule::exists(Egg::class, 'id')],
            'label' => ['required', 'string', 'max:64'],
            'description' => ['nullable', 'string', 'max:255'],
            'image' => ['required', 'string', 'max:191', 'regex:/^~?[\w\.\/\-:@ ]*$/'],
            'locations' => ['array', 'max:100'],
            'locations.*' => ['integer', Rule::exists(Location::class, 'id')],
        ]);

        return [
            'egg_id' => (int) $data['egg_id'],
            'label' => trim($data['label']),
            'description' => trim((string) ($data['description'] ?? '')),
            'image' => trim($data['image']),
            'locations' => array_values(array_unique(array_map('intval', $data['locations'] ?? []))),
        ];
    }

    public static function offer(Offer $offer): array
    {
        return [
            'id' => $offer->id,
            'egg_id' => $offer->egg_id,
            'egg' => $offer->egg?->name,
            'label' => $offer->label,
            'description' => $offer->description,
            'image' => $offer->image,
            'locations' => array_values(array_map('intval', $offer->locations ?? [])),
        ];
    }
}
