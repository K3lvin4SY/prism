<?php
// Creates Prism Core Keeper's own test server (mc-suite-test-corekeeper) and the allocation it needs.
// Idempotent: an existing test server and allocation are reused. Touches nothing else.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Actions\Allocations\CreateAllocations;
use Pterodactyl\Actions\Servers\CreateServer;
use Pterodactyl\Models\{Allocation, Egg, Node, Server, User};

$node = Node::findOrFail(1);
$owner = User::where('username', 'claude')->firstOrFail();
$tester = User::where('username', 'mcsuite-tester')->firstOrFail();
$name = 'mc-suite-test-corekeeper';
$port = 25599;

if (! Allocation::where('node_id', $node->id)->where('port', $port)->exists()) {
    app(CreateAllocations::class)->create($node, ['allocation_ip' => '0.0.0.0', 'allocation_ports' => [(string) $port], 'allocation_alias' => 'mc-suite-test']);
    echo "created allocation: $port\n";
}

$server = Server::where('name', $name)->first();
if ($server) {
    echo "exists: $name ($server->uuid)\n";
} else {
    $egg = Egg::with('variables')->findOrFail(27);
    $allocation = Allocation::where('node_id', $node->id)->where('port', $port)->whereNull('server_id')->firstOrFail();
    $environment = [];
    foreach ($egg->variables as $variable) {
        $environment[$variable->env_variable] = $variable->default_value;
    }
    $environment['WORLD_NAME'] = 'Prism Test World';

    $server = app(CreateServer::class)->create([
        'name' => $name,
        'description' => 'Test server for the Prism Core Keeper extension. Safe to delete.',
        'owner_id' => $owner->id,
        'egg_id' => $egg->id,
        'image' => array_key_first($egg->docker_images),
        'startup' => $egg->startup,
        'environment' => $environment,
        'memory' => 4096,
        'swap' => 0,
        'disk' => 10240,
        'io' => 500,
        'cpu' => 0,
        'allocation_id' => $allocation->id,
        'start_on_completion' => false,
    ]);
    echo "created: $name uuid=$server->uuid short=".substr($server->uuid, 0, 8)." port=$port\n";
}

$permissions = array_values(array_filter(app(Pterodactyl\Services\Servers\SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));
if (! Pterodactyl\Models\Subuser::where('server_id', $server->id)->where('user_id', $tester->id)->exists()) {
    app(Pterodactyl\Actions\Subusers\CreateSubuser::class)->create($server, $tester->email, $permissions);
    echo "subuser added\n";
}
