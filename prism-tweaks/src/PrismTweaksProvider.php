<?php

declare(strict_types=1);

namespace PrismTweaks;

use PrismTweaks\Fields\ServerLimitFields;
use PrismTweaks\Fields\UserLimitFields;
use PrismTweaks\Support\ApplyTweaks;
use PrismTweaks\Support\Limits;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismTweaksProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerFields(User::class, UserLimitFields::class);
        $this->registerFields(Server::class, ServerLimitFields::class);

        // Read before ApplyTweaks changes them, so the help texts name the panel's own values.
        $panel = static fn (string $key): int => config()->integer($key);
        $number = static fn (string $key, int $max, string $label, string $tab, string $help): Setting => Setting::make($key, $key, 0, ['required', 'integer', 'min:0', "max:{$max}"])->label($label)->help($help)->tab($tab)->field('number');

        $apiNames = ['client' => 'Panel and client API', 'application' => 'Application API', 'admin' => 'Admin API'];
        $apiHelp = [
            'client' => 'Requests a minute each person may make while using the panel, and with their own API keys. ',
            'application' => 'Requests a minute for each Application API key\'s owner, such as a billing system. ',
            'admin' => 'Requests a minute each admin may make in the admin area. ',
        ];

        $settings = [];
        foreach ($apiNames as $api => $label) {
            $settings[] = $number("{$api}_limit", Limits::HIGHEST_API, $label, 'Rate limits', $apiHelp[$api].'0 keeps the panel\'s '.$panel("http.rate_limit.{$api}").'. The lowest is '.Limits::LOWEST_API.'.')->frontend();
        }
        $settings[] = Setting::make('admins_unlimited', 'admins_unlimited', false, ['required', 'boolean'])->label('No limit for root admins')->help('Root admins can make as many requests as they like, to every API.')->tab('Rate limits')->field('toggle');
        $settings[] = Setting::make('user_limits', 'user_limits', '{}', ['required', 'string', 'json'])->label('People with their own limits')->help('Their own number replaces the one above. Also set on each user\'s page in the admin area.')->tab('Rate limits')->textarea(60000);

        foreach (Limits::RESOURCES as $resource) {
            $settings[] = $number($resource['key'], Limits::HIGHEST_RESOURCE, $resource['label'], 'Server limits', '0 keeps the panel\'s '.$resource['panel'].'. A server can have its own number on its page in the admin area.')->frontend();
        }

        $settings[] = $number('session_minutes', 525600, 'Stay signed in for', 'Sign-in', 'Minutes without using the panel before people have to sign in again. 0 keeps the panel\'s '.$panel('session.lifetime').'.');

        $settings[] = $number('activity_days', 3650, 'Keep activity for', 'Activity', 'Days before activity log entries are deleted. 0 keeps the panel\'s '.$panel('activity.prune_days').'.');
        $settings[] = Setting::make('hide_admin_activity', 'hide_admin_activity', 'panel', ['required', 'string', 'in:panel,on,off'])->label('Admin activity on servers')->help('What admins do on servers they are not a member of is still recorded; this decides whether the server\'s activity page shows it.')->tab('Activity')->field('select', [
            ['value' => 'panel', 'label' => config('activity.hide_admin_activity') ? 'The panel\'s (hidden)' : 'The panel\'s (shown)'],
            ['value' => 'off', 'label' => 'Show it'],
            ['value' => 'on', 'label' => 'Hide it'],
        ]);

        $settings[] = $number('max_edit_mb', 512, 'Largest file the editor opens', 'Files & schedules', 'In MB. 0 keeps the panel\'s '.round($panel('pterodactyl.files.max_edit_size') / 1024 / 1024, 1).' MB.');
        $settings[] = $number('schedule_task_limit', 100, 'Tasks in one schedule', 'Files & schedules', '0 keeps the panel\'s '.$panel('pterodactyl.client_features.schedules.per_schedule_task_limit').'.');

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), $settings));

        // Last, so nothing is changed if anything above fails.
        ApplyTweaks::apply();
    }
}
