<?php

declare(strict_types=1);

namespace PrismStatus\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismStatus\Support\Settings;
use PrismStatus\Support\Summary;
use Pterodactyl\Services\Extensions\ExtensionAssetPublisher;
use Pterodactyl\Services\Extensions\ExtensionRepository;
use Symfony\Component\HttpFoundation\RedirectResponse;

/** The public status page at /status and the summary it reads. */
final class PageController
{
    public function page(Request $request, ExtensionRepository $extensions, ExtensionAssetPublisher $assets): Response|RedirectResponse
    {
        abort_unless(Settings::bool('enabled'), 404);
        if (Settings::bool('require_sign_in') && $request->user() === null) {
            return redirect('/auth/login');
        }

        $manifest = $extensions->discovered()->first(fn ($manifest): bool => $manifest->id === 'prism-status');
        abort_if($manifest === null, 404);

        return response()->view('ext-prism-status::page', [
            'title' => Settings::string('title') ?: config('app.name').' status',
            'script' => $assets->assetUrl($manifest, 'status/status.js'),
            'style' => $assets->assetUrl($manifest, 'status/status.css'),
        ])->withHeaders([
            'Content-Security-Policy' => "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Referrer-Policy' => 'same-origin',
            'X-Frame-Options' => 'DENY',
            'Cache-Control' => 'no-cache',
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        abort_unless(Settings::bool('enabled'), 404);
        abort_if(Settings::bool('require_sign_in') && $request->user() === null, 403, 'Sign in to see the status page.');

        return response()->json(['data' => Summary::get()])->header('Cache-Control', 'no-cache');
    }
}
