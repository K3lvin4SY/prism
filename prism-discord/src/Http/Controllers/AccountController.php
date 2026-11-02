<?php

declare(strict_types=1);

namespace PrismDiscord\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PrismDiscord\Models\Link;
use PrismDiscord\Support\Accounts;
use PrismDiscord\Support\Commands;
use PrismDiscord\Support\Settings;
use Pterodactyl\Models\User;

/** The account's "Discord" page: linking a Discord account for slash commands. */
final class AccountController
{
    public function show(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $link = Link::query()->where('user_id', $user->id)->first();
        $status = Commands::status();

        return response()->json(['data' => [
            'available' => $status['configured'],
            'linked' => $link ? ['name' => $link->discord_name, 'since' => $link->created_at->toIso8601String(), 'last_used_at' => $link->last_used_at?->toIso8601String()] : null,
            'via_auth' => Accounts::authName($user),
            // Only admins see how the commands are doing on Discord.
            'commands' => $user->root_admin ? $status : null,
            'endpoint' => rtrim((string) config('app.url'), '/').'/discord/interactions',
        ]]);
    }

    public function link(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $code = (string) $request->validate(['code' => ['required', 'string', 'regex:/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/']])['code'];
        if (! str_contains($code, '-')) {
            $code = substr($code, 0, 4).'-'.substr($code, 4);
        }
        $link = Accounts::redeem($user, $code);
        abort_if($link === null, 422, 'That code is wrong or has run out. Type /link in Discord for a new one.');

        return response()->json(['data' => ['name' => $link->discord_name]]);
    }

    public function unlink(Request $request): Response
    {
        Link::query()->where('user_id', $this->user($request)->id)->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        abort_unless(Settings::bool('enabled'), 404, 'Discord is turned off on this panel.');

        return $request->user();
    }
}
