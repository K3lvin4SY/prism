<?php
// Read-only: prints the config_files of the eggs used by mc-suite-test-* servers.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

foreach (Pterodactyl\Models\Server::where('name', 'like', 'mc-suite-test-%')->with('egg')->get() as $server) {
    echo "== {$server->name} egg={$server->egg->name}\n", mb_substr((string) $server->egg->inherit_config_files, 0, 600), "\n";
}
