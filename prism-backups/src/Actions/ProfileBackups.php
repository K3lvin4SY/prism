<?php

declare(strict_types=1);

namespace PrismBackups\Actions;

use PrismBackups\Support\Profiles;
use PrismBackups\Support\Settings;
use Pterodactyl\Contracts\Backups\InitiatesBackups;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;

/**
 * Wraps the panel's backup action. A "# prism-backups: profile=<name>" line in the ignore list
 * becomes that profile's patterns (and its lock); a backup that names nothing at all uses the
 * server's default profile, when it has one, and "# prism-backups: none" only its .pteroignore.
 */
final class ProfileBackups implements InitiatesBackups
{
    private array $ignored = [];

    private bool $locked = false;

    public function __construct(private readonly InitiatesBackups $inner) {}

    public function setIsLocked(bool $isLocked): InitiatesBackups
    {
        $this->locked = $isLocked;

        return $this;
    }

    public function setIgnoredFiles(?array $ignored): InitiatesBackups
    {
        $this->ignored = $ignored ?? [];

        return $this;
    }

    public function initiate(Server $server, ?string $name = null, bool $override = false): Backup
    {
        $ignored = array_values(array_filter($this->ignored, static fn ($line): bool => is_string($line) && mb_trim($line) !== ''));
        $locked = $this->locked;
        $this->ignored = [];
        $this->locked = false;

        // With profiles turned off the marker lines are dropped and the rest goes through as it is.
        if (! Settings::bool('enabled', true) || ! Settings::bool('feature_profiles', true)) {
            $plain = array_values(array_filter(Profiles::withoutMarker($ignored), static fn (string $line): bool => preg_match(Profiles::NONE, $line) !== 1));

            return $this->inner->setIgnoredFiles($plain)->setIsLocked($locked)->initiate($server, $name, $override);
        }

        // Wings reads .pteroignore only for an empty list, so "no profile" copies it in, to keep
        // the default profile out. With no .pteroignore the marker stays, and nothing is ignored.
        $none = array_values(array_filter($ignored, static fn (string $line): bool => preg_match(Profiles::NONE, $line) === 1));
        if ($none !== []) {
            $rest = array_values(array_filter($ignored, static fn (string $line): bool => preg_match(Profiles::NONE, $line) !== 1));
            $ignored = [...$rest, ...(Profiles::pteroignore($server) ?: [$none[0]])];
        }

        $named = Profiles::marker($ignored);
        $profile = $named !== null ? Profiles::find($server, $named) : ($ignored === [] ? Profiles::default($server) : null);
        if ($named !== null && $profile === null) {
            throw new DisplayException(sprintf('This server has no backup profile called "%s".', $named));
        }

        if ($profile !== null) {
            $ignored = [...Profiles::withoutMarker($ignored), ...Profiles::lines($profile, $server)];
            $locked = $locked || (bool) $profile->lock_backups;
        }

        $backup = $this->inner->setIgnoredFiles($ignored)->setIsLocked($locked)->initiate($server, $name, $override);

        if ($profile !== null) {
            Profiles::remember($server, $backup->uuid, (string) $profile->name);
        }

        return $backup;
    }
}
