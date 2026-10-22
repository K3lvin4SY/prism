<?php
// Read-only: prints the last argv[2] (default 400) console lines of one mc-suite-test-* server.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-'.($argv[1] ?? 'pumpkin'))->firstOrFail();
foreach (Pterodactyl\Facades\Daemon::server($server)->logs((int) ($argv[2] ?? 400)) as $line) {
    echo mb_substr(preg_replace('/\e\[[0-9;?]*[A-Za-z]/', '', $line), 0, 400)."\n";
}
