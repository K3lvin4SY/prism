<?php

declare(strict_types=1);

namespace PrismMc\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use PrismMc\Support\Settings;
use Symfony\Component\HttpFoundation\Response;

/** Refuses the routes of a feature the admin turned off in Prism Properties. */
final class RequireFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        abort_unless((bool) Settings::admin($feature, true), 403, 'The administrator has turned this off.');

        return $next($request);
    }
}
