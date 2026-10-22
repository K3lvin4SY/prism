<?php
// Read-only: lists catalog eggs whose name or id mentions bedrock.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

foreach (app(Pterodactyl\Services\Eggs\EggCatalogService::class)->all() as $entry) {
    $text = json_encode($entry);
    if (stripos($text, 'bedrock') !== false) {
        echo mb_substr($text, 0, 300), "\n";
    }
}
