<?php
// Read-only: prints the Vanilla Bedrock egg's variables and install script.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$egg = Pterodactyl\Models\Egg::with('variables')->where('name', 'Vanilla Bedrock')->firstOrFail();
foreach ($egg->variables as $v) echo "VAR {$v->env_variable} = {$v->default_value} ({$v->rules})\n";
echo "--- script\n", $egg->script_install, "\n";
