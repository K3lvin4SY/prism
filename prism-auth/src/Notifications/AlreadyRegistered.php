<?php

declare(strict_types=1);

namespace PrismAuth\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent instead of a confirmation when the address already has an account, so the sign-up form
 * never tells anyone which addresses are registered.
 */
class AlreadyRegistered extends Notification
{
    /** @return list<string> */
    public function via(): array
    {
        return ['mail'];
    }

    public function toMail(): MailMessage
    {
        $app = config()->string('app.name');

        return (new MailMessage)
            ->subject('You already have an account on '.$app)
            ->line('Someone, hopefully you, tried to create an account on '.$app.' with this email address, but it already has one.')
            ->action('Sign in', url('/auth/login'))
            ->line('Forgot your password? Use "Forgot password" on the sign-in page. If this was not you, ignore this email.');
    }
}
