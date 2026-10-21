<?php
// Replaces the claude account's "mc-suite-test" client API key and prints the full token once.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$user = Pterodactyl\Models\User::where('username', 'claude')->firstOrFail();
$user->apiKeys()->where('memo', 'mc-suite-test (safe to delete)')->delete();
$token = app(Pterodactyl\Actions\Api\CreateAccountApiKey::class)->create($user, 'mc-suite-test (safe to delete)', null);
echo $token->accessToken->identifier.$token->plainTextToken, "\n";
