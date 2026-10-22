<?php
// Points MC Suite's own Pumpkin test server at Pumpkin's glibc nightly build through the egg's
// DL_PATH variable and reinstalls it. Touches no other server.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$server = Pterodactyl\Models\Server::where('name', 'mc-suite-test-pumpkin')->firstOrFail();
$variable = $server->egg->variables()->where('env_variable', 'DL_PATH')->firstOrFail();
Pterodactyl\Models\ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $argv[1] ?? '']);
app(Pterodactyl\Contracts\Servers\ReinstallsServers::class)->reinstall($server->fresh());
echo "DL_PATH set, reinstalling\n";
