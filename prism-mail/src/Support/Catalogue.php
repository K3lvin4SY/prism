<?php

declare(strict_types=1);

namespace PrismMail\Support;

use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Notifications\AccountCreated;
use Pterodactyl\Notifications\AddedToServer;
use Pterodactyl\Notifications\MailTested;
use Pterodactyl\Notifications\RemovedFromServer;
use Pterodactyl\Notifications\SendPasswordReset;
use Pterodactyl\Notifications\ServerInstalled;

/** The panel's emails: what each is for, the placeholders it fills, and a sample to preview or test. */
final class Catalogue
{
    /** @var array<class-string<Notification>, array{label: string, about: string, placeholders: list<string>}> */
    public const array EMAILS = [
        AccountCreated::class => ['label' => 'Account created', 'about' => 'Sent when an admin makes an account for someone, with a link to set a password.', 'placeholders' => ['name', 'username', 'email', 'panel']],
        SendPasswordReset::class => ['label' => 'Password reset', 'about' => 'Sent when someone asks to reset a forgotten password.', 'placeholders' => ['name', 'username', 'email', 'panel']],
        AddedToServer::class => ['label' => 'Added to a server', 'about' => 'Sent when someone is made a subuser of a server.', 'placeholders' => ['name', 'server', 'panel']],
        RemovedFromServer::class => ['label' => 'Removed from a server', 'about' => 'Sent when someone stops being a subuser of a server.', 'placeholders' => ['name', 'server', 'panel']],
        ServerInstalled::class => ['label' => 'Server installed', 'about' => 'Sent to a server\'s owner when it has finished installing.', 'placeholders' => ['name', 'username', 'server', 'panel']],
        MailTested::class => ['label' => 'Mail settings test', 'about' => 'Sent by the test button in the panel\'s own mail settings.', 'placeholders' => ['name', 'username', 'email', 'panel']],
    ];

    /** @return list<array{notification: string, label: string, about: string, placeholders: list<string>}> */
    public static function list(): array
    {
        return array_map(static fn (string $class, array $email): array => ['notification' => $class, ...$email], array_keys(self::EMAILS), self::EMAILS);
    }

    /** The email's name in addresses, like account-created. */
    public static function key(string $class): string
    {
        return Str::kebab(class_basename($class));
    }

    /** @return class-string<Notification>|null */
    public static function classFor(string $key): ?string
    {
        foreach (array_keys(self::EMAILS) as $class) {
            if (self::key($class) === $key) {
                return $class;
            }
        }

        return null;
    }

    /** What the placeholders hold for an email to this person. */
    public static function values(?Notification $notification, mixed $notifiable): array
    {
        $user = $notifiable instanceof User ? $notifiable : null;
        $email = $user?->email ?? ($notifiable instanceof AnonymousNotifiable ? (string) ($notifiable->routes['mail'] ?? '') : '');
        $values = [
            'panel' => (string) config('app.name'),
            'name' => self::nameOf($user),
            'username' => (string) ($user?->username ?? ''),
            'email' => is_string($email) ? $email : '',
            'server' => '',
        ];

        if ($notification instanceof AccountCreated) {
            $values = [...$values, 'name' => self::nameOf($notification->user), 'username' => $notification->user->username, 'email' => $notification->user->email];
        } elseif ($notification instanceof AddedToServer || $notification instanceof RemovedFromServer) {
            $values = [...$values, 'name' => (string) ($notification->server['user'] ?? $values['name']), 'server' => (string) ($notification->server['name'] ?? '')];
        } elseif ($notification instanceof ServerInstalled) {
            $values['server'] = isset($notification->server) ? (string) $notification->server->name : '';
            if (isset($notification->user)) {
                $values = [...$values, 'name' => self::nameOf($notification->user), 'username' => $notification->user->username];
            }
        }

        return $values;
    }

    /** The subject the panel gives an email that sets none. */
    public static function defaultSubject(Notification $notification): string
    {
        return Str::title(Str::snake(class_basename($notification), ' '));
    }

    /** One of the panel's emails filled with made-up details, to preview or send as a test. */
    public static function sample(string $class, User $admin): ?Notification
    {
        $name = self::nameOf($admin);
        $server = ['user' => $name, 'name' => 'Survival', 'uuidShort' => 'a1b2c3d4'];

        return match ($class) {
            AccountCreated::class => new AccountCreated($admin, 'sample-token'),
            SendPasswordReset::class => new SendPasswordReset('sample-token'),
            AddedToServer::class => new AddedToServer($server),
            RemovedFromServer::class => new RemovedFromServer($server),
            ServerInstalled::class => self::installed($admin),
            MailTested::class => new MailTested($admin),
            default => null,
        };
    }

    private static function installed(User $admin): ServerInstalled
    {
        $notification = new ServerInstalled();
        $notification->server = (new Server())->forceFill(['name' => 'Survival']);
        $notification->user = $admin;

        return $notification;
    }

    private static function nameOf(?User $user): string
    {
        if ($user === null) {
            return '';
        }
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : (string) $user->username;
    }
}
