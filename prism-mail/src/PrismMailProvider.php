<?php

declare(strict_types=1);

namespace PrismMail;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\View;
use PrismMail\Console\PruneCommand;
use PrismMail\Support\Mailer;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismMailProvider extends ExtensionProvider
{
    /** Logos mail clients can show. */
    private const array MAIL_IMAGES = ['image/png', 'image/jpeg', 'image/gif'];

    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerCommands([PruneCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-mail:prune')->daily()->withoutOverlapping(30));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Brand the panel\'s emails')->help('Off, emails look and read as the panel sends them. Your wording is kept for later.')->tab('Look')->field('toggle')->frontend(),
            Setting::make('brand_color', 'brand_color', '#3869d4')->label('Brand color')->help('Links and buttons. Use a hex color: mail clients do not understand the others.')->tab('Look')->color(),
            Setting::make('logo', 'logo', null)->label('Logo')->help('PNG, JPG or GIF, up to 512 KB, shown at the top of every email. Mail clients rarely show SVG.')->tab('Look')->file(self::MAIL_IMAGES, 512),
            Setting::make('layout_logo', 'layout_logo', true, ['required', 'boolean'])->label('Use Prism Layout\'s logo')->help('When Prism Mail has no logo of its own and Prism Layout\'s is a PNG, JPG or GIF.')->tab('Look')->field('toggle'),
            Setting::make('header_text', 'header_text', '', ['nullable', 'string', 'max:120'])->label('Heading')->help('Beside or instead of the logo. Empty shows the panel\'s name. You can use {panel}.')->tab('Look')->field('text'),
            Setting::make('sign_off', 'sign_off', 'Regards,', ['nullable', 'string', 'max:120'])->label('Sign-off')->help('Above the panel\'s name at the end. Empty leaves both out.')->tab('Look')->field('text'),
            Setting::make('footer_text', 'footer_text', '', ['nullable', 'string', 'max:500'])->label('Footer')->help('Small print at the bottom, such as your address. Empty shows a copyright line. You can use {panel}.')->tab('Look')->textarea(500),
            Setting::make('log', 'log', true, ['required', 'boolean'])->label('Keep a delivery log')->help('Who each email went to, its subject, and whether the mail server took it. Never the email itself.')->tab('Delivery log')->field('toggle'),
            Setting::make('log_days', 'log_days', 30, ['required', 'integer', 'min:1', 'max:365'])->label('Keep log entries for')->tab('Delivery log')->field('number'),
        ]));

        // Laravel's mail events are not staged by the panel; they are added last so a failed boot adds none.
        Event::listen(NotificationSending::class, [Mailer::class, 'notificationSending']);
        Event::listen(NotificationSent::class, [Mailer::class, 'notificationSent']);
        Event::listen(MessageSending::class, [Mailer::class, 'sending']);
        Event::listen(MessageSent::class, [Mailer::class, 'sent']);

        // Prism's mail view comes before the panel's own; it shows the panel's when branding is off.
        View::prependNamespace('notifications', $this->extensionPath('resources', 'views', 'notifications'));
    }
}
