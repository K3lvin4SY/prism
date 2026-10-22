<?php
// Adds the existing Minecraft tag to the Vanilla Bedrock egg MC Suite created for its tests (egg 15),
// so MC Suite, which now needs that tag, keeps working on it. Touches no other egg.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$egg = Pterodactyl\Models\Egg::where('name', 'Vanilla Bedrock')->firstOrFail();
$tag = Pterodactyl\Models\Tag::where('slug', 'minecraft')->firstOrFail();
$egg->tags()->syncWithoutDetaching([$tag->id]);
echo "egg $egg->id tags: ", json_encode($egg->fresh()->tagSlugs()), "\n";
