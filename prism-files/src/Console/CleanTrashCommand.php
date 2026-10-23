<?php

declare(strict_types=1);

namespace PrismFiles\Console;

use Illuminate\Console\Command;
use Pterodactyl\Models\Server;
use PrismFiles\Support\Paths;
use PrismFiles\Support\Trash;
use Throwable;

/** Deletes trash older than the admin's retention on every server that has used the trash. */
class CleanTrashCommand extends Command
{
    protected $signature = 'prism-files:clean-trash';

    protected $description = 'Delete Prism File Browser trash older than the retention setting.';

    public function handle(): int
    {
        $days = max(1, (int) Paths::setting('trash_days', 7));
        $keep = [];

        foreach (Trash::registered() as $id) {
            $server = Server::query()->find($id);
            if (! $server instanceof Server) {
                continue;
            }

            try {
                $trash = Trash::for($server);
                $removed = $trash->expire($days);
                if ($removed > 0) {
                    $this->line(sprintf('%s: %d items deleted for good.', $server->name, $removed));
                }

                if ($trash->items() !== []) {
                    $keep[] = $id;
                }
            } catch (Throwable $exception) {
                // An offline node keeps its trash until the next run.
                $keep[] = $id;
                $this->warn(sprintf('%s: %s', $server->name, $exception->getMessage()));
            }
        }

        Trash::setRegistered($keep);

        return self::SUCCESS;
    }
}
