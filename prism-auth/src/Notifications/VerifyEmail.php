<?php

declare(strict_types=1);

namespace PrismAuth\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The link that proves an address is the person's own. Sent at once through the panel's mailer
 * rather than queued, so sign-up does not wait on the queue worker.
 */
class VerifyEmail extends Notification
{
    public function __construct(public string $username, public string $url, public int $hours) {}

    /** @return list<string> */
    public function via(): array
    {
        return ['mail'];
    }

    public function toMail(): MailMessage
    {
        $app = config()->string('app.name');

        return (new MailMessage)
            ->subject('Confirm your email for '.$app)
            ->greeting('Hello '.$this->username.'!')
            ->line('Someone, hopefully you, asked to create an account on '.$app.' with this email address.')
            ->action('Confirm my email', $this->url)
            ->line('The link works for '.$this->hours.' '.($this->hours === 1 ? 'hour' : 'hours').' and only once.')
            ->line('If this was not you, ignore this email and no account is made.');
    }
}
