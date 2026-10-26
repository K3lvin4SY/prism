<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

use RuntimeException;

/** A sign-in that could not finish; the code tells the sign-in page what to say. */
final class SignInFailed extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message = '')
    {
        parent::__construct($message !== '' ? $message : $reason);
    }
}
