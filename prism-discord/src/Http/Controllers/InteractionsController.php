<?php

declare(strict_types=1);

namespace PrismDiscord\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PrismDiscord\Support\Commands;
use PrismDiscord\Support\Interactions;

/**
 * Discord's interactions endpoint, /discord/interactions: public, so every request must carry
 * Discord's signature for the administrator's application.
 */
final class InteractionsController
{
    public function __invoke(Request $request): JsonResponse
    {
        $body = $request->getContent();
        abort_unless(Commands::configured(), 404);
        abort_unless(Interactions::verify(Commands::publicKey(), (string) $request->header('X-Signature-Ed25519', ''), (string) $request->header('X-Signature-Timestamp', ''), $body), 401, 'invalid request signature');

        $interaction = json_decode($body, true);
        abort_unless(is_array($interaction), 400);

        return response()->json(Interactions::handle($interaction));
    }
}
