<?php
// Sets the Docker image of one of MC Suite's own test servers (argv[1] = full name, must start
// with mc-suite-test-) and syncs it to Wings. Touches no other server.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$name = $argv[1] ?? '';
if (! str_starts_with($name, 'mc-suite-test-')) {
    exit("refusing: not a test server\n");
}

$server = Pterodactyl\Models\Server::where('name', $name)->firstOrFail();
$server->forceFill(['image' => $argv[2]])->save();
Pterodactyl\Facades\Daemon::server($server)->sync();
echo "$name image: {$server->image}\n";
