<?php
// Creates Prism Satisfactory's own test server (mc-suite-test-satisfactory) and the two allocations it needs:
// the game port (also the HTTPS API) and the reliable port.
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
$name = 'mc-suite-test-satisfactory';
$port = 25601;
$reliable = 25602;

foreach ([$port, $reliable] as $wanted) {
    if (! Allocation::where('node_id', $node->id)->where('port', $wanted)->exists()) {
        app(CreateAllocations::class)->create($node, ['allocation_ip' => '0.0.0.0', 'allocation_ports' => [(string) $wanted], 'allocation_alias' => 'mc-suite-test']);
        echo "created allocation: $wanted\n";
    }
}

$server = Server::where('name', $name)->first();
if ($server) {
    echo "exists: $name ($server->uuid)\n";
} else {
    $egg = Egg::with('variables')->findOrFail(19);
    $allocation = Allocation::where('node_id', $node->id)->where('port', $port)->whereNull('server_id')->firstOrFail();
    $extra = Allocation::where('node_id', $node->id)->where('port', $reliable)->whereNull('server_id')->firstOrFail();
    $environment = [];
    foreach ($egg->variables as $variable) {
        $environment[$variable->env_variable] = $variable->default_value;
    }
    $environment['RELIABLE_PORT'] = (string) $reliable;

    $server = app(CreateServer::class)->create([
        'name' => $name,
        'description' => 'Test server for the Prism Satisfactory extension. Safe to delete.',
        'owner_id' => $owner->id,
        'egg_id' => $egg->id,
        'image' => array_key_first($egg->docker_images),
        'startup' => $egg->startup,
        'environment' => $environment,
        'memory' => 8192,
        'swap' => 0,
        'disk' => 20480,
        'io' => 500,
        'cpu' => 0,
        'allocation_id' => $allocation->id,
        'allocation_additional' => [$extra->id],
        'start_on_completion' => false,
    ]);
    echo "created: $name uuid=$server->uuid short=".substr($server->uuid, 0, 8)." port=$port\n";
}

$permissions = array_values(array_filter(app(Pterodactyl\Services\Servers\SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));
if (! Pterodactyl\Models\Subuser::where('server_id', $server->id)->where('user_id', $tester->id)->exists()) {
    app(Pterodactyl\Actions\Subusers\CreateSubuser::class)->create($server, $tester->email, $permissions);
    echo "subuser added\n";
}
