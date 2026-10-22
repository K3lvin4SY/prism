<?php
// Gives mcsuite-tester every permission (Terraria Suite's included) on the Terraria test servers.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Models\{Server, Subuser, User};
use Pterodactyl\Services\Servers\SubuserPermissionCatalog;

$user = User::where('username', 'mcsuite-tester')->firstOrFail();
$keys = array_values(array_filter(app(SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));
foreach (['mc-suite-test-terraria', 'mc-suite-test-tshock', 'mc-suite-test-tmodloader'] as $name) {
    $server = Server::where('name', $name)->firstOrFail();
    $subuser = Subuser::where('server_id', $server->id)->where('user_id', $user->id)->firstOrFail();
    app(Pterodactyl\Actions\Subusers\UpdateSubuser::class)->update($server, $subuser, $keys);
    echo "$name: ".count(array_filter($keys, fn ($k) => str_starts_with($k, 'ext.terraria-suite.')))." Terraria Suite permissions\n";
}
