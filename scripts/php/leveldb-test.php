<?php
// Diagnostic: reads keys from mc-suite-test-bedrock's world database with MC Suite's LevelDB reader.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-bedrock')->firstOrFail();
$files = McSuite\Support\ServerFiles::for($server);
$db = new McSuite\Support\LevelDb($files, 'worlds/Bedrock level/db');
foreach (['', 'player', 'Overworld', 'scoreboard', 'mobevents', 'BiomeData', '~local'] as $prefix) {
    $start = microtime(true);
    try {
        $found = $db->scan($prefix);
        $keys = array_keys($found);
        $printable = array_values(array_filter($keys, fn ($k) => ctype_print($k)));
        printf("prefix %-12s %4d keys (%d printable) in %.2fs: %s\n", "'$prefix'", count($found), count($printable), microtime(true) - $start, implode(', ', array_slice($printable, 0, 8)));
    } catch (Throwable $e) {
        echo "prefix '$prefix' error: ".$e->getMessage()."\n";
    }
}
