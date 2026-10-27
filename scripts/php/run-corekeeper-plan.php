<?php
// Runs one Prism Core Keeper install plan (by job id) in this process instead of on the queue, for testing
// while the queue worker is down. Touches no other job.
// Usage: run-corekeeper-plan.php <job id>, or `current` for the plan queued on mc-suite-test-corekeeper
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Cache;
use PrismCoreKeeper\Jobs\RunInstallPlan;
use PrismCoreKeeper\Support\InstallPlan;

$job = $argv[1] ?? exit("job id needed\n");
if ($job === 'current') {
    $job = InstallPlan::current(Pterodactyl\Models\Server::where('name', 'mc-suite-test-corekeeper')->firstOrFail()) ?? exit("no plan is queued\n");
    echo "job $job\n";
}
$progress = app(Pterodactyl\Services\Extensions\ExtensionJobProgress::class);
$deadline = time() + 420;
while (Cache::has(InstallPlan::stateKey($job)) && time() < $deadline) {
    (new RunInstallPlan($job))->handle($progress);
    $state = Cache::get(InstallPlan::stateKey($job));
    if (is_array($state)) {
        echo 'step ', $state['cursor'], '/', count($state['steps']), ' ', $state['steps'][$state['cursor']]['type'] ?? '', "\n";
        sleep(3);
    }
}
$snapshot = $progress->find('prism-corekeeper', $job);
echo 'finished: ', $snapshot?->status ?? '?', ' ', $snapshot?->message ?? '', "\n";
