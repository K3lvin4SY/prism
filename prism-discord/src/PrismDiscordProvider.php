<?php

declare(strict_types=1);

namespace PrismDiscord;

use Illuminate\Console\Scheduling\Schedule;
use PrismDiscord\Console\TickCommand;
use PrismDiscord\Support\Events;
use Pterodactyl\Events\Server\OperationCompleted;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismDiscordProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->registerRootRoutes($this->extensionPath('routes', 'root.php'));

        $this->registerPermissions('Discord messages from Prism Discord.', [
            'manage' => 'Add, change and remove the server\'s Discord webhooks and send test messages.',
        ]);

        $this->registerCommands([TickCommand::class]);
        $this->registerSchedule(static fn (Schedule $schedule) => $schedule->command('prism-discord:tick')->everyMinute()->withoutOverlapping(5));

        // Backups and installs are told to the panel by the node, so they arrive as they finish.
        $this->listenToServerOperations(static function (OperationCompleted $event): void {
            if (! in_array($event->operation, ['backup', 'install', 'reinstall'], true)) {
                return;
            }
            $server = Server::query()->where('uuid', $event->serverUuid)->first();
            if ($server === null) {
                return;
            }
            if ($event->operation === 'backup') {
                $backup = Backup::query()->where('uuid', $event->resourceUuid)->first();
                Events::fire($server, $event->successful ? 'backup.complete' : 'backup.fail', ['backup' => $backup?->name ?? 'backup']);
            } elseif ($event->successful) {
                Events::fire($server, 'install');
            }
        });

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Send Discord messages')->help('Off, no messages are sent and the Discord page is hidden. Webhooks are kept.')->tab('General')->field('toggle')->frontend(),
            Setting::make('players', 'players', true, ['required', 'boolean'])->label('Player joins and leaves')->help('Read from the console once a minute, for games that print them (Minecraft, Factorio, Terraria).')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_hooks', 'max_hooks', 5, ['required', 'integer', 'min:1', 'max:25'])->label('Webhooks per server')->tab('General')->field('number')->frontend(),
            Setting::make('app_id', 'app_id', '', ['nullable', 'string', 'regex:/^(\d{5,24})?$/'])->label('Application id')->help('From the Discord Developer Portal: your application, General Information. Set its Interactions Endpoint URL to this panel\'s address followed by /discord/interactions.')->tab('Slash commands'),
            Setting::make('public_key', 'public_key', '', ['nullable', 'string', 'regex:/^([0-9a-fA-F]{64})?$/'])->label('Public key')->help('From the same page. Every command Discord sends is checked against it.')->tab('Slash commands'),
            Setting::make('bot_token', 'bot_token', '', ['nullable', 'string', 'max:128'])->label('Bot token')->help('From the Bot page. Only used to put the commands on Discord; stored encrypted. Invite the application with the applications.commands scope.')->tab('Slash commands')->secret(),
        ]));
    }
}
