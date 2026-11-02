<?php

declare(strict_types=1);

namespace PrismAudit\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use PrismAudit\Models\Alert;

/** An audit alert, emailed to the panel's root admins. */
class AuditAlert extends Notification
{
    public function __construct(private readonly Alert $alert) {}

    /** @return list<string> */
    public function via(): array
    {
        return ['mail'];
    }

    public function toMail(): MailMessage
    {
        return (new MailMessage())
            ->error()
            ->subject('Audit alert on '.config('app.name'))
            ->greeting('Something to look at')
            ->line($this->alert->summary)
            ->action('Open the audit log', url('/panel/audit'))
            ->line('You get this because you are an administrator. Alert emails can be turned off in Prism Properties, under Prism Audit.');
    }
}
