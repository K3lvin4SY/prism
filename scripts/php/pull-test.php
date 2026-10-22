<?php
// Diagnostic: asks Wings to pull a URL in the foreground into mc-suite-test-bedrock and prints the result.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-bedrock')->firstOrFail();
try {
    $response = Pterodactyl\Facades\Daemon::server($server)->files()->pull($argv[1], '/', ['filename' => 'mcs-pull-test.bin', 'foreground' => true, 'timeout' => 30]);
    echo 'ok '.$response->status()."\n";
} catch (Throwable $e) {
    $previous = $e->getPrevious();
    echo get_class($e).': '.$e->getMessage()."\n";
    if ($previous && method_exists($previous, 'response') && $previous->response) echo 'wings: '.$previous->response->body()."\n";
    elseif ($previous) echo 'cause: '.$previous->getMessage()."\n";
}
