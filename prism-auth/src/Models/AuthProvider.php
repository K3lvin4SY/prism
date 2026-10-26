<?php

declare(strict_types=1);

namespace PrismAuth\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * A sign-in provider set up in Prism Properties. The client secret is stored encrypted and
 * never leaves the server.
 *
 * @property int $id
 * @property string $type google, discord, github, steam or oidc
 * @property string $slug
 * @property string $name
 * @property string $label
 * @property string|null $icon
 * @property string|null $color
 * @property string|null $client_id
 * @property string|null $secret the decrypted client secret
 * @property string|null $issuer
 * @property string|null $scopes
 * @property bool $enabled
 * @property bool $allow_signup
 * @property int $sort
 */
class AuthProvider extends Model
{
    public const array TYPES = ['google', 'discord', 'github', 'steam', 'oidc'];

    protected $table = 'prism_auth_providers';

    protected $guarded = ['id'];

    protected $hidden = ['client_secret'];

    protected $casts = [
        'enabled' => 'boolean',
        'allow_signup' => 'boolean',
        'sort' => 'integer',
    ];

    /** @return HasMany<Identity, $this> */
    public function identities(): HasMany
    {
        return $this->hasMany(Identity::class, 'provider_id');
    }

    /** @return Attribute<string|null, string|null> */
    protected function secret(): Attribute
    {
        return Attribute::make(
            get: function (): ?string {
                $stored = $this->attributes['client_secret'] ?? null;
                if (! is_string($stored) || $stored === '') {
                    return null;
                }

                try {
                    return Crypt::decryptString($stored);
                } catch (Throwable) {
                    return null;
                }
            },
            set: fn (?string $value): array => ['client_secret' => $value === null || $value === '' ? null : Crypt::encryptString($value)],
        );
    }

    /** Where the provider sends people back to: the address to paste into its app settings. */
    public function callbackUrl(): string
    {
        return url('/prism-auth/'.$this->slug.'/callback');
    }

    /** What the sign-in page and the account page may know: never the client id or secret. */
    public function toPublic(): array
    {
        return [
            'slug' => $this->slug,
            'type' => $this->type,
            'name' => $this->name,
            'label' => $this->label,
            'icon' => $this->icon,
            'color' => $this->color,
        ];
    }
}
