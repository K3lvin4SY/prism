<?php

declare(strict_types=1);

namespace PrismAuth\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Rules\Username;
use Throwable;

/** The sign-up form's rules, as set in Prism Properties. */
final class SignupRules
{
    /**
     * @param  array<string, mixed>  $input
     * @param  bool  $passwordOptional  true when the account signs in through the provider it came from
     * @return array{email: string, username: string|null, name_first: string|null, name_last: string|null, password: string|null}
     *
     * @throws ValidationException
     */
    public static function validate(array $input, bool $passwordOptional): array
    {
        $password = Password::min(max(8, Settings::int('password_min', 8)));
        if (Settings::bool('password_mixed')) {
            $password->mixedCase();
        }
        if (Settings::bool('password_number')) {
            $password->numbers();
        }

        $choose = Settings::string('signup_username', 'choose') === 'choose';
        $names = Settings::bool('signup_names', true);

        $data = Validator::validate($input, [
            'email' => ['required', 'string', 'email:strict', 'max:191'],
            'username' => $choose ? ['required', 'string', 'between:3,191', new Username] : ['nullable', 'string'],
            'name_first' => $names ? ['required', 'string', 'between:1,191'] : ['nullable', 'string', 'max:191'],
            'name_last' => $names ? ['required', 'string', 'between:1,191'] : ['nullable', 'string', 'max:191'],
            'password' => $passwordOptional ? ['nullable', 'string', $password] : ['required', 'string', $password],
            'terms' => Settings::string('terms_url') !== '' ? ['accepted'] : ['nullable'],
        ], [
            'terms.accepted' => 'Please accept the terms to create an account.',
        ]);

        $email = mb_strtolower(trim((string) $data['email']));
        if (! self::domainAllowed($email)) {
            throw ValidationException::withMessages(['email' => 'Accounts cannot be made with this email domain.']);
        }

        return [
            'email' => $email,
            'username' => $choose ? mb_strtolower(trim((string) $data['username'])) : null,
            'name_first' => isset($data['name_first']) ? trim((string) $data['name_first']) : null,
            'name_last' => isset($data['name_last']) ? trim((string) $data['name_last']) : null,
            'password' => isset($data['password']) && $data['password'] !== '' ? (string) $data['password'] : null,
        ];
    }

    /** The domain, or a parent of it, is on the allowed list (when there is one) and not on the blocked list. */
    public static function domainAllowed(string $email): bool
    {
        $domain = mb_strtolower(substr((string) strrchr($email, '@'), 1));
        $matches = static function (array $list) use ($domain): bool {
            foreach ($list as $entry) {
                $entry = ltrim($entry, '@*.');
                if ($entry !== '' && ($domain === $entry || str_ends_with($domain, '.'.$entry))) {
                    return true;
                }
            }

            return false;
        };

        $allowed = Settings::list('domains_allowed');
        if ($allowed !== [] && ! $matches($allowed)) {
            return false;
        }

        return ! $matches(Settings::list('domains_blocked'));
    }

    /**
     * The bot checks: a hidden field people leave empty and a form filled slower than a script,
     * and Cloudflare Turnstile when a secret is set.
     *
     * @param  array<string, mixed>  $input
     *
     * @throws ValidationException
     */
    public static function human(array $input, ?string $ip): void
    {
        if (Settings::bool('bot_trap', true) && ((string) ($input['website'] ?? '') !== '' || (int) ($input['elapsed'] ?? 0) < 2500)) {
            throw ValidationException::withMessages(['email' => 'That was quick. Please wait a moment and try again.']);
        }

        $secret = Settings::string('turnstile_secret');
        if ($secret === '' || Settings::string('turnstile_site_key') === '') {
            return;
        }

        try {
            $passed = Http::asForm()->timeout(8)->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
                'secret' => $secret,
                'response' => (string) ($input['turnstile'] ?? ''),
                'remoteip' => $ip,
            ])->json('success') === true;
        } catch (Throwable) {
            $passed = false;
        }

        if (! $passed) {
            throw ValidationException::withMessages(['turnstile' => 'The human check did not pass. Please try it again.']);
        }
    }
}
