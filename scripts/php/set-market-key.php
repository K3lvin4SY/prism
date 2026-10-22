<?php
// Stores the Pumpkin Market API key (argv[1]) in MC Suite's admin settings, encrypted as a secret.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

McSuite\Support\Settings::store()->setSecret('pumpkin_market_key', $argv[1] ?? '');
echo 'stored: ', str_starts_with((string) McSuite\Support\Settings::admin('pumpkin_market_key'), 'pmk_') ? 'yes' : 'no', "\n";
