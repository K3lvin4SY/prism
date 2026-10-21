<?php
// Reinstalls only the mc-suite-test-* servers.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

foreach (Pterodactyl\Models\Server::where('name', 'like', 'mc-suite-test-%')->get() as $server) {
    try {
        app(Pterodactyl\Actions\Servers\ReinstallServer::class)->reinstall($server);
        echo "reinstalling {$server->name}\n";
    } catch (Throwable $e) {
        echo "{$server->name}: ".get_class($e).': '.$e->getMessage()."\n";
    }
}
