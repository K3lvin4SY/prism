<?php
// Sends a power action (start, stop, restart, kill) to mc-suite-test-corekeeper only.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$action = $argv[1] ?? '';
if (! in_array($action, ['start', 'stop', 'restart', 'kill'], true)) exit("usage: start|stop|restart|kill\n");
$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-corekeeper')->firstOrFail();
Pterodactyl\Facades\Daemon::server($server)->power($action);
echo "$action sent to {$server->uuid}\n";
