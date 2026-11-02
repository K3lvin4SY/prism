<?php

declare(strict_types=1);

namespace PrismAudit\Support;

use Illuminate\Support\Facades\Http;
use PrismAudit\Models\Alert;
use PrismAudit\Notifications\AuditAlert;
use Pterodactyl\Models\User;
use Throwable;

/** Tells people about a new alert: an email to every root admin and a webhook post, as the settings ask. */
final class Deliver
{
    public static function alert(Alert $alert): void
    {
        if (Settings::bool('alert_email')) {
            foreach (User::query()->where('root_admin', true)->get() as $admin) {
                try {
                    $admin->notifyNow(new AuditAlert($alert));
                } catch (Throwable $exception) {
                    report($exception);
                }
            }
        }

        $webhook = Settings::string('alert_webhook');
        if (Settings::bool('alert_webhook_on') && str_starts_with($webhook, 'https://')) {
            $text = '**'.config('app.name').' audit alert:** '.$alert->summary;
            try {
                // Discord reads content, Slack and Mattermost read text.
                Http::timeout(8)->acceptJson()->post($webhook, ['content' => $text, 'text' => $text, 'allowed_mentions' => ['parse' => []]])->throw();
            } catch (Throwable $exception) {
                report($exception);
            }
        }
    }
}
