<?php
// Read-only: state, recent console output and files of mc-suite-test-corekeeper. Pass a directory to list it,
// or "cat <file>" to print the start of a text file.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;

$server = Server::where('name', 'mc-suite-test-corekeeper')->firstOrFail();
$daemon = Daemon::server($server);
echo "status=".var_export($server->status, true).' wings='.($daemon->details()['state'] ?? '?')."\n";

if (($argv[1] ?? '') === 'cat') {
    echo mb_substr($daemon->files()->getContent($argv[2]), 0, (int) ($argv[3] ?? 4000)), "\n";
    exit;
}
if (isset($argv[1])) {
    foreach ($daemon->files()->getDirectory($argv[1]) as $f) printf("  %s%s %d %s\n", $f['name'], ($f['directory'] ?? false) || ($f['file'] ?? true) === false ? '/' : '', $f['size'] ?? 0, $f['modified'] ?? '');
    exit;
}
foreach (array_slice($daemon->logs(40), -25) as $line) echo '  | '.mb_substr(preg_replace('/\e\[[0-9;]*m/', '', $line), 0, 200)."\n";
echo '  files: '.implode(', ', array_map(fn ($f) => $f['name'], $daemon->files()->getDirectory('/')))."\n";
