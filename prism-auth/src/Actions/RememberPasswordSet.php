<?php

declare(strict_types=1);

namespace PrismAuth\Actions;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Contracts\Users\UpdatesUserPasswords;
use Pterodactyl\Models\User;

/**
 * Once someone sets a password (account page or reset link), their password counts as a way to
 * sign in, so they may unlink their last provider.
 */
final readonly class RememberPasswordSet implements UpdatesUserPasswords
{
    public function __construct(private UpdatesUserPasswords $inner) {}

    public function update(User $user, string $password): User
    {
        $updated = $this->inner->update($user, $password);
        DB::table('prism_auth_passwordless')->where('user_id', $user->id)->delete();

        return $updated;
    }
}
