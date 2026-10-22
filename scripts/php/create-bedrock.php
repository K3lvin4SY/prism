<?php
// Imports the catalog's Vanilla Bedrock egg (once) and creates mc-suite-test-bedrock on it,
// with mcsuite-tester as a full subuser. Idempotent.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Actions\Eggs\Sharing\ImportCatalogEgg;
use Pterodactyl\Actions\Servers\CreateServer;
use Pterodactyl\Actions\Subusers\CreateSubuser;
use Pterodactyl\Models\{Allocation, Egg, Server, User};
use Pterodactyl\Services\Servers\SubuserPermissionCatalog;

$egg = Egg::where('name', 'Vanilla Bedrock')->first();
if (! $egg) {
    $egg = app(ImportCatalogEgg::class)->import('games-vanilla-bedrock');
    echo "imported egg {$egg->id} {$egg->name} tags=".$egg->load('tags')->tags->pluck('slug')->implode(',')."\n";
} else {
    echo "egg exists {$egg->id}\n";
}

if (Server::where('name', 'mc-suite-test-bedrock')->exists()) {
    exit("server exists\n");
}

$egg->load('variables');
$environment = [];
foreach ($egg->variables as $variable) {
    $environment[$variable->env_variable] = $variable->default_value;
}

$allocation = Allocation::where('node_id', 1)->where('port', 25593)->whereNull('server_id')->firstOrFail();
$owner = User::where('username', 'claude')->firstOrFail();
$server = app(CreateServer::class)->create([
    'name' => 'mc-suite-test-bedrock',
    'description' => 'Test server for the MC Suite extension. Safe to delete.',
    'owner_id' => $owner->id,
    'egg_id' => $egg->id,
    'image' => array_values($egg->docker_images)[0],
    'startup' => $egg->startup,
    'environment' => $environment,
    'memory' => 2048, 'swap' => 0, 'disk' => 5120, 'io' => 500, 'cpu' => 0,
    'allocation_id' => $allocation->id,
    'start_on_completion' => false,
]);
echo "created server {$server->uuid} image ".array_values($egg->docker_images)[0]."\n";

$tester = User::where('username', 'mcsuite-tester')->firstOrFail();
$permissions = array_values(array_filter(app(SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));
app(CreateSubuser::class)->create($server, $tester->email, $permissions);
echo "subuser added\n";
