<?php
// Clears MC Suite's and Terraria Suite's cached detection for every server, so a change to how
// servers are detected applies at once. Only the extensions' own cache keys are touched.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$count = 0;
foreach (Pterodactyl\Models\Server::query()->pluck('uuid') as $uuid) {
    Illuminate\Support\Facades\Cache::forget('ext:mc-suite:info:'.$uuid);
    Illuminate\Support\Facades\Cache::forget('ext:terraria-suite:info:'.$uuid);
    $count++;
}
echo "cleared detection for $count servers\n";
