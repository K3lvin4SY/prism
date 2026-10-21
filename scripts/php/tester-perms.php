<?php
// Sets mcsuite-tester's permissions on mc-suite-test-forge: argv[1] = "full" or "core" (no ext.mc-suite.*).
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Models\{Server, Subuser, User};
use Pterodactyl\Services\Servers\SubuserPermissionCatalog;

$server = Server::where('name', 'mc-suite-test-forge')->firstOrFail();
$user = User::where('username', 'mcsuite-tester')->firstOrFail();
$subuser = Subuser::where('server_id', $server->id)->where('user_id', $user->id)->firstOrFail();
$keys = array_values(array_filter(app(SubuserPermissionCatalog::class)->keys(), fn ($k) => $k !== '*'));
if (($argv[1] ?? 'full') === 'core') {
    $keys = array_values(array_filter($keys, fn ($k) => ! str_starts_with($k, 'ext.mc-suite.')));
}
app(Pterodactyl\Actions\Subusers\UpdateSubuser::class)->update($server, $subuser, $keys);
echo count($keys)." permissions\n";
