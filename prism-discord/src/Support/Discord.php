<?php

declare(strict_types=1);

namespace PrismDiscord\Support;

use Illuminate\Support\Facades\Http;
use PrismDiscord\Models\Hook;
use Throwable;

/** Posting to a Discord webhook. */
final class Discord
{
    public const string WEBHOOK = '#^https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$#';

    /**
     * Sends the event as an embed and records how it went on the hook.
     *
     * @param  array<string, string>  $values
     * @return array{ok: bool, error: string|null, retry: int|null} retry: seconds to wait when Discord asked to slow down
     */
    public static function send(Hook $hook, string $event, array $values): array
    {
        $address = $hook->address();
        if ($address === null) {
            return self::record($hook, 'The webhook address could not be read; enter it again.', null);
        }

        [$label, , $color] = Events::ALL[$event] ?? [$event, '', 0x64748B];
        $payload = [
            'embeds' => [[
                'title' => $label,
                'description' => Events::text($hook, $event, $values),
                'color' => $color,
                'timestamp' => now()->toIso8601String(),
            ]],
            'allowed_mentions' => ['parse' => [], 'roles' => $hook->mention_role ? [$hook->mention_role] : []],
        ];
        if ($hook->mention_role) {
            $payload['content'] = '<@&'.$hook->mention_role.'>';
        }

        try {
            $response = Http::timeout(10)->acceptJson()->post($address, $payload);
        } catch (Throwable $exception) {
            return self::record($hook, 'Discord could not be reached: '.mb_substr($exception->getMessage(), 0, 160), 60);
        }

        if ($response->status() === 429) {
            return self::record($hook, 'Discord asked to slow down; trying again shortly.', max(1, (int) ceil((float) ($response->json('retry_after') ?? 5))));
        }
        if ($response->status() === 404 || $response->status() === 401) {
            return self::record($hook, 'Discord says this webhook no longer exists. Make a new one and enter it again.', null);
        }
        if (! $response->successful()) {
            return self::record($hook, 'Discord answered '.$response->status().'.', $response->serverError() ? 30 : null);
        }

        $hook->forceFill(['last_sent_at' => now(), 'last_error' => null])->save();

        return ['ok' => true, 'error' => null, 'retry' => null];
    }

    /** @return array{ok: false, error: string, retry: int|null} */
    private static function record(Hook $hook, string $error, ?int $retry): array
    {
        $hook->forceFill(['last_error' => mb_substr($error, 0, 255)])->save();

        return ['ok' => false, 'error' => $error, 'retry' => $retry];
    }
}
