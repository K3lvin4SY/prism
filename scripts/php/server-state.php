<?php
// Read-only: Wings state and recent console/install output of the mc-suite-test-* servers.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;

foreach (Server::where('name', 'like', 'mc-suite-test-%')->get() as $server) {
    echo "== {$server->name} status=".var_export($server->status, true)."\n";
    try {
        $details = Daemon::server($server)->details();
        echo '   wings state='.($details['state'] ?? '?')."\n";
        $logs = Daemon::server($server)->logs(15);
        foreach (array_slice($logs, -8) as $line) echo '   | '.mb_substr(preg_replace('/\e\[[0-9;]*m/', '', $line), 0, 160)."\n";
        $files = Daemon::server($server)->files()->getDirectory('/');
        echo '   files: '.implode(', ', array_map(fn ($f) => $f['name'], $files))."\n";
    } catch (Throwable $e) {
        echo '   error: '.get_class($e).': '.$e->getMessage()."\n";
    }
}
