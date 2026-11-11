<?php

declare(strict_types=1);

namespace PrismTweaks\Fields;

use PrismTweaks\Support\ApplyTweaks;
use PrismTweaks\Support\Limits;
use Pterodactyl\Extensions\Fields;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Extensions\ExtensionSettings;

/**
 * "API requests a minute" on the admin user form. The numbers are kept in the `user_limits`
 * setting, the same list Prism Properties shows, so both places always agree.
 */
final class UserLimitFields extends Fields
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        $rule = ['nullable', 'integer', 'min:'.Limits::LOWEST_API, 'max:'.Limits::HIGHEST_API];

        return array_fill_keys(Limits::APIS, $rule);
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['client' => 'Panel and client API requests', 'application' => 'Application API requests', 'admin' => 'Admin API requests'];
    }

    /** @return array<string, ?int> */
    public function values(User $user): array
    {
        $limits = Limits::users($this->store()->get('user_limits'))[(int) $user->id] ?? [];

        return array_combine(Limits::APIS, array_map(static fn (string $api): ?int => $limits[$api] ?? null, Limits::APIS));
    }

    /** @param array<string, mixed> $values */
    public function save(User $user, array $values): void
    {
        $store = $this->store();
        $next = Limits::withUser($store->get('user_limits'), (int) $user->id, $values);
        if ($next !== Limits::encode(Limits::users($store->get('user_limits')))) {
            $store->set('user_limits', $next);
        }
    }

    private function store(): ExtensionSettings
    {
        return new ExtensionSettings(ApplyTweaks::EXTENSION);
    }
}
