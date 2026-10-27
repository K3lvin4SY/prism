<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use PrismCoreKeeper\Jobs\RunInstallPlan;
use PrismCoreKeeper\Support\InstallPlan;
use Pterodactyl\Models\Server;

/**
 * Lets the page that started an install run it when the Panel's queue worker does not: the
 * page calls advance every few seconds while the plan has not moved for a while.
 */
class PlansController extends Controller
{
    /** How long a plan may sit untouched before the page takes over. */
    private const int STALE_SECONDS = 10;

    public function advance(Request $request, Server $server, string $job): JsonResponse
    {
        abort_unless($this->can($request, $server, 'mods') || $this->can($request, $server, 'versions'), 403, 'You do not have permission to do this.');

        $state = Cache::get(InstallPlan::stateKey($job));
        if (! is_array($state)) {
            return new JsonResponse(['result' => 'done']);
        }
        abort_unless((int) ($state['server'] ?? 0) === $server->id, 404, 'That install is not on this server.');

        // A worker touches the plan every few seconds while it runs it; leave it alone then.
        $touched = (int) ($state['touched'] ?? $state['started'] ?? 0);
        $byPage = ($state['runner'] ?? null) === 'page';
        if (! $byPage && time() - $touched < self::STALE_SECONDS) {
            return new JsonResponse(['result' => 'busy']);
        }

        return new JsonResponse(['result' => RunInstallPlan::advance($job)]);
    }
}
