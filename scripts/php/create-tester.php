<?php
// Creates the non-admin "mcsuite-tester" account, makes it a full subuser of the
// mc-suite-test-* servers, and prints a client API key for it. Idempotent.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Actions\Api\CreateAccountApiKey;
use Pterodactyl\Actions\Subusers\CreateSubuser;
use Pterodactyl\Actions\Users\CreateUser;
use Pterodactyl\Models\{Server, Subuser, User};
use Pterodactyl\Services\Servers\SubuserPermissionCatalog;

$user = User::where('username', 'mcsuite-tester')->first() ?? app(CreateUser::class)->create([
    'email' => 'mcsuite-tester@example.com',
    'username' => 'mcsuite-tester',
    'name_first' => 'MC Suite',
    'name_last' => 'Tester',
    'password' => Illuminate\Support\Str::random(24).'aA1!',
    'root_admin' => false,
]);

$permissions = array_values(array_filter(app(SubuserPermissionCatalog::class)->keys(), fn ($key) => $key !== '*'));
foreach (Server::where('name', 'like', 'mc-suite-test-%')->get() as $server) {
    if (! Subuser::where('server_id', $server->id)->where('user_id', $user->id)->exists()) {
        app(CreateSubuser::class)->create($server, $user->email, $permissions);
        fwrite(STDERR, "subuser on {$server->name}\n");
    }
}

$user->apiKeys()->where('memo', 'mc-suite-test (safe to delete)')->delete();
$token = app(CreateAccountApiKey::class)->create($user, 'mc-suite-test (safe to delete)', null);
echo $token->accessToken->identifier.$token->plainTextToken, "\n";
