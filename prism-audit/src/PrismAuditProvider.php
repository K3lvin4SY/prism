<?php

declare(strict_types=1);

namespace PrismAudit;

use Illuminate\Console\Scheduling\Schedule;
use PrismAudit\Console\TickCommand;
use PrismAudit\Support\Describe;
use PrismAudit\Support\Settings;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismAuditProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-audit:tick')->everyMinute()->withoutOverlapping(5));

        $toggle = static fn (string $key, bool $default, string $label, string $help): Setting => Setting::make($key, $key, $default, ['required', 'boolean'])->label($label)->help($help)->tab('Alerts')->field('toggle');

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            $toggle('alerts', true, 'Alert on risky activity', 'Checked once a minute. Alerts show on the Audit page; below you choose which rules run and who else hears about them.')->frontend(),
            $toggle('rule_new_ip', true, 'Sign-ins from a new address', 'Someone signs in from an IP address they have not signed in from lately.'),
            Setting::make('new_ip_who', 'new_ip_who', 'admins', ['required', 'string', 'in:admins,everyone'])->label('Watch sign-ins of')->tab('Alerts')->field('select', [['value' => 'admins', 'label' => 'Admins'], ['value' => 'everyone', 'label' => 'Everyone']]),
            Setting::make('new_ip_days', 'new_ip_days', 90, ['required', 'integer', 'min:1', 'max:365'])->label('An address is new after')->help('Days without a sign-in from it. The panel keeps activity for 90 days by default, so longer finds nothing older.')->tab('Alerts')->field('number'),
            $toggle('rule_failed', true, 'Many failed sign-ins', 'From one IP address in a short time: someone guessing passwords.'),
            Setting::make('fail_count', 'fail_count', 10, ['required', 'integer', 'min:2', 'max:500'])->label('Failed sign-ins')->tab('Alerts')->field('number'),
            Setting::make('fail_minutes', 'fail_minutes', 10, ['required', 'integer', 'min:1', 'max:1440'])->label('Within minutes')->tab('Alerts')->field('number'),
            $toggle('rule_two_factor', true, 'Two-factor turned off', 'Someone removes two-factor authentication from their own account.'),
            Setting::make('admin_events', 'admin_events', Settings::RISKY_ADMIN_EVENTS)->label('Admin actions')->help('Each of these, done by any admin, raises an alert.')->tab('Alerts')->multiselect(Describe::options()),
            $toggle('alert_email', false, 'Email the admins', 'Every root admin gets each alert by email.'),
            $toggle('alert_webhook_on', false, 'Post to a webhook', 'Discord, Slack and Mattermost incoming webhooks all work.'),
            Setting::make('alert_webhook', 'alert_webhook', '', ['nullable', 'string', 'max:500', 'regex:/^(https:\/\/\S+)?$/'])->label('Webhook address')->help('An https address. Stored encrypted; leave it empty to keep the one saved.')->tab('Alerts')->secret(),
        ]));
    }
}
