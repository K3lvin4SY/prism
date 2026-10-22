<?php
// Sets the memory limit of MC Suite's own Pumpkin test server (argv[1] MiB) and syncs Wings.
// Touches no other server.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-pumpkin')->firstOrFail();
$server->forceFill(['memory' => (int) ($argv[1] ?? 4096)])->save();
Pterodactyl\Facades\Daemon::server($server)->sync();
echo "memory: {$server->memory}\n";
