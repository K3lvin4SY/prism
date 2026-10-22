<?php
// Read-only: prints the PumpkinMC egg: tags, image, startup, config, variables and install script.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

foreach (Pterodactyl\Models\Egg::with('variables')->where('name', 'like', '%umpkin%')->get() as $egg) {
    echo "EGG {$egg->id} {$egg->name} nest={$egg->nest_id}\n";
    echo 'TAGS ', json_encode($egg->tags ?? null), "\n";
    echo 'IMAGES ', json_encode($egg->docker_images), "\n";
    echo "STARTUP {$egg->startup}\n";
    echo "CONFIG_FILES {$egg->config_files}\nCONFIG_STARTUP {$egg->config_startup}\nCONFIG_STOP {$egg->config_stop}\n";
    foreach ($egg->variables as $v) echo "VAR {$v->env_variable} = {$v->default_value} ({$v->rules}) {$v->description}\n";
    echo "--- script ({$egg->script_container})\n", $egg->script_install, "\n";
}
