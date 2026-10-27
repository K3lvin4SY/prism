<?php
// Reinstalls mc-suite-test-corekeeper (Prism Core Keeper's own test server) through the Panel. Touches nothing else.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-corekeeper')->firstOrFail();
app(Pterodactyl\Contracts\Servers\ReinstallsServers::class)->reinstall($server);
echo "reinstalling {$server->uuid}\n";
