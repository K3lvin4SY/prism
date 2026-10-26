<?php

declare(strict_types=1);

namespace PrismAuth\Support\Providers;

/** Who a provider says signed in. */
final readonly class ExternalUser
{
    public function __construct(
        public string $subject,
        public ?string $email,
        public bool $emailVerified,
        public ?string $name,
        public ?string $username,
        public ?string $avatar,
    ) {}

    /** @return array{email: string|null, name: string|null, username: string|null, avatar: string|null} */
    public function profile(): array
    {
        return ['email' => $this->email, 'name' => $this->name, 'username' => $this->username, 'avatar' => $this->avatar];
    }
}
