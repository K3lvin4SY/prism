<?php
// Sets MC Suite's own Pumpkin test server (mc-suite-test-pumpkin) to the java_25 yolk, as an
// administrator would, and syncs it to Wings. Touches no other server.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-pumpkin')->firstOrFail();
$server->forceFill(['image' => $argv[1] ?? 'ghcr.io/pterodactyl/yolks:java_25'])->save();
Pterodactyl\Facades\Daemon::server($server)->sync();
echo "image: {$server->image}\n";
