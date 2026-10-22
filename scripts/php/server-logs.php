<?php
// Read-only: prints the Wings console buffer of one mc-suite-test-* server (argv[1] = name suffix).
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-'.($argv[1] ?? 'bedrock'))->firstOrFail();
$lines = Pterodactyl\Facades\Daemon::server($server)->logs(100);
echo count($lines)." lines\n";
foreach ($lines as $line) {
    if (preg_match('/'.($argv[2] ?? '.').'/i', $line)) echo mb_substr(preg_replace('/\e\[[0-9;]*m/', '', $line), 0, 200)."\n";
}
