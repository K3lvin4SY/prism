<?php

declare(strict_types=1);

namespace PrismMail\Support;

use Illuminate\Mail\Events\MessageSending;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use PrismMail\Models\LogEntry;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Throwable;

/** Follows each email out: which notification made it, its subject, and the delivery log. */
final class Mailer
{
    private const string HEADER = 'X-Prism-Mail';

    public static function notificationSending(NotificationSending $event): void
    {
        if ($event->channel === 'mail') {
            Current::set($event->notification, $event->notifiable);
        }
    }

    public static function notificationSent(NotificationSent $event): void
    {
        if ($event->channel === 'mail') {
            Current::clear();
        }
    }

    public static function sending(MessageSending $event): void
    {
        $message = $event->message;
        if (! $message instanceof Email) {
            return;
        }

        try {
            if (Render::enabled() && ($subject = Render::subject(Current::template())) !== null) {
                $message->subject($subject);
            }

            if (Settings::bool('log')) {
                $notification = Current::notification();
                $entry = LogEntry::query()->create([
                    'recipient' => mb_substr(implode(', ', array_map(static fn (Address $to): string => $to->getAddress(), $message->getTo())), 0, 255),
                    'subject' => mb_substr((string) $message->getSubject(), 0, 255),
                    'notification' => $notification !== null ? $notification::class : null,
                    'status' => 'sending',
                ]);
                $message->getHeaders()->addTextHeader(self::HEADER, (string) $entry->id);
            }
        } catch (Throwable $exception) {
            // An email must never fail because of its branding or its log.
            report($exception);
        }
    }

    public static function sent(MessageSent $event): void
    {
        try {
            $message = $event->sent->getOriginalMessage();
            $id = $message instanceof Email ? $message->getHeaders()->get(self::HEADER)?->getBodyAsString() : null;
            if (is_string($id) && ctype_digit($id)) {
                LogEntry::query()->whereKey((int) $id)->update(['status' => 'sent', 'sent_at' => now()]);
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
