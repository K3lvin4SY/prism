<?php

declare(strict_types=1);

namespace PrismQuotas\Http\Controllers;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use PrismQuotas\Models\Offer;
use PrismQuotas\Models\QuotaServer;
use PrismQuotas\Support\Quotas;
use PrismQuotas\Support\Settings;
use Pterodactyl\Contracts\Servers\CreatesServers;
use Pterodactyl\Contracts\Servers\DeletesServers;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Service\Deployment\NoViableAllocationException;
use Pterodactyl\Exceptions\Service\Deployment\NoViableNodeException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** The account's "Create a server" page: the person's quota, and creating and deleting their own servers. */
final class MyServersController
{
    /** Disk I/O weight for new servers: the panel's default. */
    private const int IO = 500;

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        [$allowed, $reason] = Quotas::allowed($user);
        $limit = Quotas::limitsFor($user);
        $usage = Quotas::usage($user);
        $locations = Location::query()->orderBy('short')->get()->keyBy('id');
        $made = QuotaServer::query()->with('server')->where('user_id', $user->id)->get()->filter(static fn (QuotaServer $row): bool => $row->server !== null);

        return response()->json(['data' => [
            'allowed' => $allowed,
            'reason' => $reason,
            'limits' => $limit?->values(),
            'usage' => $usage,
            'remaining' => $limit !== null ? Quotas::remaining($limit, $usage) : null,
            'minimum' => Quotas::MINIMUM,
            'offers' => $allowed ? Offer::query()->orderBy('sort')->orderBy('id')->get()->map(static fn (Offer $offer): array => [
                'id' => $offer->id,
                'label' => $offer->label,
                'description' => $offer->description,
                'locations' => collect($offer->locations === [] ? $locations->keys() : $offer->locations)
                    ->map(static fn ($id) => $locations->get($id))->filter()
                    ->map(static fn (Location $location): array => ['id' => $location->id, 'name' => $location->long ?: $location->short])->values(),
            ])->values() : [],
            'servers' => $made->map(static fn (QuotaServer $row): array => [
                'id' => $row->server->id,
                'name' => $row->server->name,
                'short' => $row->server->uuidShort,
                'memory' => (int) $row->server->memory,
                'disk' => (int) $row->server->disk,
                'cpu' => (int) $row->server->cpu,
                'status' => $row->server->status,
            ])->values(),
            'can_delete' => Settings::bool('allow_delete'),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        [$allowed, $reason] = Quotas::allowed($user);
        abort_unless($allowed, 403, (string) $reason);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:191'],
            'offer_id' => ['required', 'integer'],
            'location_id' => ['required', 'integer'],
            'memory' => ['required', 'integer', 'min:'.Quotas::MINIMUM['memory']],
            'disk' => ['required', 'integer', 'min:'.Quotas::MINIMUM['disk']],
            'cpu' => ['required', 'integer', 'min:'.Quotas::MINIMUM['cpu']],
        ]);
        $offer = Offer::query()->with('egg.variables')->findOrFail($data['offer_id']);
        abort_if($offer->egg === null, 422, 'That kind of server is no longer offered.');
        abort_unless($offer->locations === [] || in_array((int) $data['location_id'], array_map('intval', $offer->locations), true), 422, 'That location is not offered for this kind of server.');
        abort_unless(Location::query()->whereKey($data['location_id'])->exists(), 422, 'That location does not exist.');

        // One request per person at a time, so two quick clicks cannot both fit in the last of a quota.
        try {
            return Cache::lock("prism-quotas:create:{$user->id}", 120)->block(10, fn (): JsonResponse => $this->create($user, $offer, $data));
        } catch (LockTimeoutException) {
            abort(429, 'Your last server is still being created. Try again in a moment.');
        }
    }

    public function destroy(Request $request, int $id): Response
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(Settings::bool('allow_delete'), 403, 'Deleting servers is turned off on this panel.');
        $row = QuotaServer::query()->with('server')->where('user_id', $user->id)->where('server_id', $id)->firstOrFail();
        $model = $row->server;
        abort_if($model === null || $model->owner_id !== $user->id, 404);
        abort_unless($request->input('confirm') === $model->name, 422, 'Type the server\'s name to delete it.');

        Activity::event('server:prism-quotas.delete')->subject($model)->property(['name' => $model->name])->log();
        app(DeletesServers::class)->delete($model);

        return response()->noContent();
    }

    /** @param array<string, mixed> $data */
    private function create(User $user, Offer $offer, array $data): JsonResponse
    {
        $limit = Quotas::limitsFor($user);
        abort_if($limit === null, 403, 'There is no quota set up on this panel yet.');
        $misfit = Quotas::misfit(Quotas::remaining($limit, Quotas::usage($user)), (int) $data['memory'], (int) $data['disk'], (int) $data['cpu']);
        abort_if($misfit !== null, 422, (string) $misfit);

        $egg = $offer->egg;
        $environment = $egg->variables->mapWithKeys(static fn (EggVariable $variable): array => [$variable->env_variable => $variable->default_value ?? ''])->all();
        $deployment = (new DeploymentObject())->setDedicated(false)->setLocations([(int) $data['location_id']])->setPorts([]);

        try {
            $server = app(CreatesServers::class)->create([
                'name' => trim($data['name']),
                'description' => 'Created by '.$user->username.' with Prism Quotas.',
                'owner_id' => $user->id,
                'egg_id' => $egg->id,
                'image' => $offer->image,
                'startup' => $egg->startup,
                'environment' => $environment,
                'memory' => (int) $data['memory'],
                'swap' => 0,
                'disk' => (int) $data['disk'],
                'io' => self::IO,
                'cpu' => (int) $data['cpu'],
                'database_limit' => $limit->databases,
                'allocation_limit' => $limit->allocations,
                'backup_limit' => $limit->backups,
                'start_on_completion' => true,
            ], $deployment);
        } catch (NoViableNodeException) {
            abort(422, 'No node in that location has room for a server this size. Try a smaller one or another location.');
        } catch (NoViableAllocationException) {
            abort(422, 'No node in that location has a free port. Ask an administrator to add some.');
        } catch (DisplayException $exception) {
            abort(422, $exception->getMessage());
        }

        QuotaServer::query()->create(['server_id' => $server->id, 'user_id' => $user->id]);
        Activity::event('server:prism-quotas.create')->subject($server)->property(['name' => $server->name, 'offer' => $offer->label])->log();

        return response()->json(['data' => ['id' => $server->id, 'short' => $server->uuidShort, 'name' => $server->name]], 201);
    }
}
