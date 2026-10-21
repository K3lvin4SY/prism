<?php
// Creates MC Suite's own test servers (mc-suite-test-*) and the allocations they need.
// Idempotent: existing test servers and allocations are reused. Touches nothing else.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Actions\Allocations\CreateAllocations;
use Pterodactyl\Actions\Servers\CreateServer;
use Pterodactyl\Models\{Allocation, Egg, Node, Server, User};

$node = Node::findOrFail(1);
$owner = User::where('username', 'claude')->firstOrFail();
$ports = range(25590, 25594);

$missing = array_values(array_filter($ports, fn ($p) => ! Allocation::where('node_id', $node->id)->where('port', $p)->exists()));
if ($missing !== []) {
    app(CreateAllocations::class)->create($node, ['allocation_ip' => '0.0.0.0', 'allocation_ports' => array_map('strval', $missing), 'allocation_alias' => 'mc-suite-test']);
    echo 'created allocations: '.implode(',', $missing)."\n";
}

$servers = [
    ['mc-suite-test-paper', 4, 'ghcr.io/pterodactyl/yolks:java_21'],
    ['mc-suite-test-fabric', 2, 'ghcr.io/pterodactyl/yolks:java_21'],
    ['mc-suite-test-forge', 1, 'ghcr.io/pterodactyl/yolks:java_21'],
];

foreach ($servers as [$name, $eggId, $image]) {
    if ($existing = Server::where('name', $name)->first()) {
        echo "exists: $name ($existing->uuid)\n";
        continue;
    }

    $egg = Egg::with('variables')->findOrFail($eggId);
    $allocation = Allocation::where('node_id', $node->id)->whereIn('port', $ports)->whereNull('server_id')->orderBy('port')->firstOrFail();
    $environment = [];
    foreach ($egg->variables as $variable) {
        $environment[$variable->env_variable] = $variable->default_value;
    }

    $server = app(CreateServer::class)->create([
        'name' => $name,
        'description' => 'Test server for the MC Suite extension. Safe to delete.',
        'owner_id' => $owner->id,
        'egg_id' => $egg->id,
        'image' => $image,
        'startup' => $egg->startup,
        'environment' => $environment,
        'memory' => 3072,
        'swap' => 0,
        'disk' => 10240,
        'io' => 500,
        'cpu' => 0,
        'allocation_id' => $allocation->id,
        'start_on_completion' => false,
    ]);
    echo "created: $name uuid=$server->uuid id=$server->uuid_short port=$allocation->port\n";
}
