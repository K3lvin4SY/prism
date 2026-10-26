<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

/** Google is OpenID Connect at accounts.google.com. */
final class GoogleProvider extends OidcProvider
{
    protected function issuer(): string
    {
        return 'https://accounts.google.com';
    }

    protected function authorizeParameters(array $state): array
    {
        return [...parent::authorizeParameters($state), 'prompt' => 'select_account'];
    }
}
