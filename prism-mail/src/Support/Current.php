<?php

declare(strict_types=1);

namespace PrismMail\Support;

use Illuminate\Notifications\Notification;
use PrismMail\Models\Template;

/**
 * The notification being turned into an email right now. The panel's mail view only gets the
 * message's lines, so this tells it which template applies and what the placeholders hold.
 */
final class Current
{
    private static ?Notification $notification = null;

    private static mixed $notifiable = null;

    /** A template from the editor, previewed instead of the saved one. */
    private static ?Template $draft = null;

    public static function set(Notification $notification, mixed $notifiable, ?Template $draft = null): void
    {
        self::$notification = $notification;
        self::$notifiable = $notifiable;
        self::$draft = $draft;
    }

    public static function clear(): void
    {
        self::$notification = null;
        self::$notifiable = null;
        self::$draft = null;
    }

    public static function notification(): ?Notification
    {
        return self::$notification;
    }

    public static function notifiable(): mixed
    {
        return self::$notifiable;
    }

    /** The template for the current email: the draft being previewed, else the saved one. */
    public static function template(): ?Template
    {
        if (self::$draft !== null) {
            return self::$draft;
        }
        if (self::$notification === null) {
            return null;
        }

        return rescue(static fn () => Template::query()->where('notification', self::$notification::class)->first(), null, false);
    }
}
