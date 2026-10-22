<?php
// Creates Terraria Suite's own test servers (mc-suite-test-terraria, -tshock, -tmodloader) and the
// allocations they need. Idempotent: existing test servers and allocations are reused. Touches nothing else.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Actions\Allocations\CreateAllocations;
use Pterodactyl\Actions\Servers\CreateServer;
use Pterodactyl\Models\{Allocation, Egg, Node, Server, User};

$node = Node::findOrFail(1);
$owner = User::where('username', 'claude')->firstOrFail();
$tester = User::where('username', 'mcsuite-tester')->firstOrFail();

// name => [egg, image, port]
$servers = [
    'mc-suite-test-terraria' => [23, 'ghcr.io/ptero-eggs/yolks:debian', 25596],
    'mc-suite-test-tshock' => [21, 'ghcr.io/ptero-eggs/yolks:dotnet_6', 25597],
    'mc-suite-test-tmodloader' => [22, 'ghcr.io/ptero-eggs/yolks:dotnet_8', 25598],
];

$missing = array_values(array_filter(array_column($servers, 2), fn ($p) => ! Allocation::where('node_id', $node->id)->where('port', $p)->exists()));
if ($missing !== []) {
    app(CreateAllocations::class)->create($node, ['allocation_ip' => '0.0.0.0', 'allocation_ports' => array_map('strval', $missing), 'allocation_alias' => 'mc-suite-test']);
    echo 'created allocations: '.implode(',', $missing)."\n";
}

$permissions = array_values(array_filter(app(Pterodactyl\Services\Servers\SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));

foreach ($servers as $name => [$eggId, $image, $port]) {
    $server = Server::where('name', $name)->first();
    if ($server) {
        echo "exists: $name ($server->uuid)\n";
    } else {
        $egg = Egg::with('variables')->findOrFail($eggId);
        $allocation = Allocation::where('node_id', $node->id)->where('port', $port)->whereNull('server_id')->firstOrFail();
        $environment = [];
        foreach ($egg->variables as $variable) {
            $environment[$variable->env_variable] = $variable->default_value;
        }

        $server = app(CreateServer::class)->create([
            'name' => $name,
            'description' => 'Test server for the Terraria Suite extension. Safe to delete.',
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
        echo "created: $name uuid=$server->uuid port=$port\n";
    }

    if (! Pterodactyl\Models\Subuser::where('server_id', $server->id)->where('user_id', $tester->id)->exists()) {
        app(Pterodactyl\Actions\Subusers\CreateSubuser::class)->create($server, $tester->email, $permissions);
        echo "subuser added to $name\n";
    }
}
