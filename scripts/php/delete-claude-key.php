<?php
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
echo Pterodactyl\Models\User::where('username', 'claude')->firstOrFail()->apiKeys()->where('memo', 'mc-suite-test (safe to delete)')->delete(), " removed\n";
