<?php

declare(strict_types=1);

namespace PrismAuth;

use Illuminate\Console\Scheduling\Schedule;
use PrismAuth\Actions\RememberPasswordSet;
use PrismAuth\Models\Verification;
use Pterodactyl\Contracts\Users\UpdatesUserPasswords;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismAuthProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerRootRoutes($this->extensionPath('routes', 'root.php'));

        $this->wrapAction(UpdatesUserPasswords::class, fn (UpdatesUserPasswords $inner): UpdatesUserPasswords => new RememberPasswordSet($inner));

        // Sign-ups nobody confirmed.
        $this->registerSchedule(fn (Schedule $schedule) => $schedule->call(fn () => Verification::query()->where('expires_at', '<', now()->subDay())->delete())->daily()->name('prism-auth:forget-verifications'));

        $options = static fn (array $values): array => array_map(static fn ($value, $label) => ['value' => $value, 'label' => $label], array_keys($values), $values);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            // Sign-in page
            Setting::make('button_style', 'button_style', 'rows', ['required', 'string', 'in:rows,icons'])->label('Provider buttons')->help('A full-width button per provider, or a row of icons.')->tab('Sign-in')->field('select', $options(['rows' => 'Buttons', 'icons' => 'Icons']))->frontend()->public(),
            Setting::make('divider_text', 'divider_text', 'Or continue with', ['nullable', 'string', 'max:60'])->label('Divider text')->help('Above the provider buttons. Empty leaves just a line.')->tab('Sign-in')->field('text')->frontend()->public(),

            // Accounts
            Setting::make('link_by_email', 'link_by_email', true, ['required', 'boolean'])->label('Match accounts by email')->help('Someone signing in with a provider for the first time is linked to the account with the same email, if the provider has confirmed the address.')->tab('Accounts')->field('toggle'),
            Setting::make('link_admins', 'link_admins', false, ['required', 'boolean'])->label('Match admin accounts too')->help('Off, admins link providers themselves from their account page.')->tab('Accounts')->field('toggle'),
            Setting::make('auto_create', 'auto_create', false, ['required', 'boolean'])->label('Make an account on first sign-in')->help('Someone new signing in with a provider gets an account. With a confirmed email it is made at once; otherwise they confirm their email first. Each provider can opt out.')->tab('Accounts')->field('toggle')->frontend()->public(),

            // Sign-up
            Setting::make('signup_enabled', 'signup_enabled', false, ['required', 'boolean'])->label('Let people sign up')->help('Shows "Create an account" on the sign-in page. New accounts confirm their email before they can sign in, and are never admins.')->tab('Sign-up')->field('toggle')->frontend()->public(),
            Setting::make('signup_username', 'signup_username', 'choose', ['required', 'string', 'in:choose,generate'])->label('Username')->help('People pick their username, or it is made from their email.')->tab('Sign-up')->field('select', $options(['choose' => 'People pick one', 'generate' => 'Made from the email']))->frontend()->public(),
            Setting::make('signup_names', 'signup_names', true, ['required', 'boolean'])->label('Ask for first and last name')->tab('Sign-up')->field('toggle')->frontend()->public(),
            Setting::make('password_min', 'password_min', 8, ['required', 'integer', 'min:8', 'max:64'])->label('Shortest password')->tab('Sign-up')->field('number')->frontend()->public(),
            Setting::make('password_mixed', 'password_mixed', false, ['required', 'boolean'])->label('Password needs upper and lower case')->tab('Sign-up')->field('toggle')->frontend()->public(),
            Setting::make('password_number', 'password_number', false, ['required', 'boolean'])->label('Password needs a number')->tab('Sign-up')->field('toggle')->frontend()->public(),
            Setting::make('domains_allowed', 'domains_allowed', '', ['nullable', 'string', 'max:5000'])->label('Only these email domains')->help('One per line, like example.com; subdomains count. Empty allows every domain.')->tab('Sign-up')->textarea(5000),
            Setting::make('domains_blocked', 'domains_blocked', '', ['nullable', 'string', 'max:5000'])->label('Never these email domains')->help('One per line, like throwaway mail services.')->tab('Sign-up')->textarea(5000),
            Setting::make('terms_url', 'terms_url', '', ['nullable', 'string', 'max:512', 'regex:#^(https?://|/)#'])->label('Terms page')->help('With an address here, people tick "I accept the terms" to sign up.')->tab('Sign-up')->field('text')->frontend()->public(),
            Setting::make('bot_trap', 'bot_trap', true, ['required', 'boolean'])->label('Bot trap')->help('A hidden field and a minimum time to fill the form, which stop most scripts without bothering people.')->tab('Sign-up')->field('toggle')->frontend()->public(),
            Setting::make('turnstile_site_key', 'turnstile_site_key', '', ['nullable', 'string', 'max:128'])->label('Cloudflare Turnstile site key')->help('With a site key and secret, the form asks Turnstile whether this is a person.')->tab('Sign-up')->field('text')->frontend()->public(),
            Setting::make('turnstile_secret', 'turnstile_secret', '', ['nullable', 'string', 'max:128'])->label('Cloudflare Turnstile secret')->tab('Sign-up')->field('password'),
            Setting::make('limit_per_hour', 'limit_per_hour', 5, ['required', 'integer', 'min:1', 'max:100'])->label('Sign-ups per network per hour')->help('Sign-ups and resent emails from one network address.')->tab('Sign-up')->field('number'),
            Setting::make('verify_hours', 'verify_hours', 24, ['required', 'integer', 'min:1', 'max:168'])->label('Email link works for (hours)')->tab('Sign-up')->field('number'),

            // Providers, edited by Prism Properties through the admin API: they hold secrets.
            Setting::make('providers', 'providers', '', ['nullable', 'string', 'max:1'])->label('Sign-in providers')->help('Google, Discord, GitHub, Steam and any OpenID Connect provider. Client secrets are stored encrypted and never shown again.')->tab('Providers')->textarea(1),
        ]));
    }
}
