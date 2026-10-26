<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use Illuminate\Http\Request;

/**
 * One sign-in protocol. `redirect` builds the address to send the browser to; `user` checks the
 * callback against the same state and says who signed in.
 */
interface Provider
{
    /** @param  array{state: string, verifier: string, nonce: string}  $state */
    public function redirect(array $state): string;

    /**
     * @param  array{state: string, verifier: string, nonce: string}  $state
     *
     * @throws SignInFailed
     */
    public function user(Request $request, array $state): ExternalUser;
}
