<?php

declare(strict_types=1);

namespace PrismShare\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use PrismShare\Models\Link;
use Pterodactyl\Facades\Daemon;
use Throwable;

/** Finding the link a guest's token belongs to, and cutting off its guests. */
final class Links
{
    /** Wrong tokens one network address may try in ten minutes. */
    private const int MISSES = 30;

    /** @return array{0: string, 1: string} a new token and its hash: only the hash is stored */
    public static function token(): array
    {
        $token = Str::random(48);

        return [$token, hash('sha256', $token)];
    }

    /**
     * The link for the token in the request, with what it may do right now, or the request is
     * stopped. Every guest request goes through here, so every rule is checked every time.
     *
     * @return array{0: Link, 1: list<string>} the link and its effective options
     */
    public static function fromRequest(Request $request): array
    {
        $key = 'prism-share:miss:'.$request->ip();
        abort_if(RateLimiter::tooManyAttempts($key, self::MISSES), 429, 'Too many tries. Please wait a few minutes.');

        $token = $request->header('X-Prism-Share');
        $link = is_string($token) && preg_match('/^[A-Za-z0-9]{48}$/', $token)
            ? Link::query()->with(['server.node', 'user'])->where('token_hash', hash('sha256', $token))->first()
            : null;

        if ($link === null || ! $link->active() || ! Settings::bool('enabled')) {
            RateLimiter::hit($key, 600);
            abort(404, 'This link does not work any more. Ask for a new one.');
        }

        try {
            $link->server->validateCurrentState();
        } catch (Throwable) {
            abort(409, 'The server is not available right now (suspended, installing, restoring or moving). Try again later.');
        }

        $options = Capabilities::effective($link);
        abort_if($options === [], 403, 'This link does not allow anything any more. Ask for a new one.');

        return [$link, $options];
    }

    /** Stops the request unless the link may do this. */
    public static function needs(array $options, string $option): void
    {
        abort_unless(in_array($option, $options, true), 403, 'This link does not allow that.');
    }

    /**
     * Drops the link's open consoles at once. Wings refuses every token issued for this link
     * before now, so guests still on the page reconnect with what the link allows now.
     */
    public static function disconnect(Link $link): void
    {
        try {
            Daemon::node($link->server->node)->deauthorize($link->uuid, [$link->server->uuid]);
        } catch (Throwable $exception) {
            // The node may be offline; its tokens still expire within five minutes.
            report($exception);
        }
    }
}
