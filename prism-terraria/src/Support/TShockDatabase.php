<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use PDO;
use Pterodactyl\Models\Server;
use RuntimeException;

/**
 * TShock's SQLite database (tshock/tshock.sqlite): accounts, groups, bans and server-side
 * characters. It is copied from the server and opened read-only, so the running server is
 * never locked or changed; changes go through TShock's own console commands.
 */
final class TShockDatabase
{
    public const string FILE = 'tshock/tshock.sqlite';

    private const int MAX_FILE = 64 * 1024 * 1024;

    /** .NET ticks at the Unix epoch, and the "never expires" value TShock uses. */
    private const int TICKS_AT_EPOCH = 621355968000000000;

    private const int TICKS_FOREVER = 3155378975999999999;

    private function __construct(private readonly PDO $pdo, private readonly string $path) {}

    /** null when the server uses MySQL or PostgreSQL, or has no database yet. */
    public static function open(Server $server): ?self
    {
        $files = ServerFiles::for($server);
        $size = $files->size(self::FILE);
        if ($size === null) {
            return null;
        }

        throw_if($size > self::MAX_FILE, RuntimeException::class, 'The TShock database is too large to read here.');
        $bytes = $files->read(self::FILE, self::MAX_FILE);
        if ($bytes === null) {
            return null;
        }

        $path = tempnam(sys_get_temp_dir(), 'trs-tshock-');
        file_put_contents($path, $bytes);
        unset($bytes);

        $pdo = new PDO('sqlite:'.$path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);

        return new self($pdo, $path);
    }

    public function __destruct()
    {
        @unlink($this->path);
    }

    /** @return list<array<string, mixed>> */
    public function accounts(): array
    {
        $characters = array_flip(array_map('intval', $this->pdo->query('SELECT Account FROM tsCharacter')->fetchAll(PDO::FETCH_COLUMN)));

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['ID'],
            'name' => (string) $row['Username'],
            'group' => (string) $row['Usergroup'],
            'registered' => $row['Registered'],
            'lastSeen' => $row['LastAccessed'],
            'ips' => array_values(array_filter((array) json_decode((string) ($row['KnownIPs'] ?? '[]'), true), 'is_string')),
            'hasCharacter' => isset($characters[(int) $row['ID']]),
        ], $this->pdo->query('SELECT ID, Username, Usergroup, Registered, LastAccessed, KnownIPs FROM Users ORDER BY Username COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array<string, mixed>|null */
    public function account(int $id): ?array
    {
        foreach ($this->accounts() as $account) {
            if ($account['id'] === $id) {
                return $account;
            }
        }

        return null;
    }

    /** @return list<string> */
    public function groups(): array
    {
        return $this->pdo->query('SELECT GroupName FROM GroupList ORDER BY GroupName')->fetchAll(PDO::FETCH_COLUMN);
    }

    /** @return list<array<string, mixed>> bans that have not run out */
    public function bans(): array
    {
        $now = self::TICKS_AT_EPOCH + time() * 10_000_000;
        $bans = [];
        foreach ($this->pdo->query('SELECT TicketNumber, Identifier, Reason, BanningUser, Date, Expiration FROM PlayerBans ORDER BY TicketNumber DESC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $expiration = (int) $row['Expiration'];
            if ($expiration < $now) {
                continue;
            }

            [$type, $value] = explode(':', (string) $row['Identifier'], 2) + [1 => ''];
            $bans[] = [
                'ticket' => (int) $row['TicketNumber'],
                'type' => $type,
                'value' => $value,
                'reason' => (string) $row['Reason'],
                'by' => (string) $row['BanningUser'],
                'date' => self::time((int) $row['Date']),
                'expires' => $expiration >= self::TICKS_FOREVER ? null : self::time($expiration),
            ];
        }

        return $bans;
    }

    /** @return array<string, mixed>|null the account's server-side character */
    public function character(int $account): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM tsCharacter WHERE Account = ?');
        $statement->execute([$account]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }

        // "netID,stack,prefix,favorited~…" in TShock's slot order.
        $items = [];
        foreach (explode('~', (string) $row['Inventory']) as $slot => $item) {
            $parts = explode(',', $item);
            $id = (int) ($parts[0] ?? 0);
            $stack = (int) ($parts[1] ?? 0);
            if ($id !== 0 && $stack > 0) {
                $items[] = ['slot' => $slot, 'id' => $id, 'stack' => $stack, 'prefix' => (int) ($parts[2] ?? 0), 'favorited' => ($parts[3] ?? '0') === '1'];
            }
        }

        $flag = static fn (string $key): bool => (int) ($row[$key] ?? 0) === 1;

        return [
            'health' => (int) $row['Health'],
            'maxHealth' => (int) $row['MaxHealth'],
            'mana' => (int) $row['Mana'],
            'maxMana' => (int) $row['MaxMana'],
            'items' => $items,
            'questsCompleted' => (int) ($row['questsCompleted'] ?? 0),
            'deaths' => ['pve' => (int) ($row['deathsPVE'] ?? 0), 'pvp' => (int) ($row['deathsPVP'] ?? 0)],
            'loadout' => (int) ($row['currentLoadoutIndex'] ?? 0),
            'spawn' => [(int) ($row['spawnX'] ?? -1), (int) ($row['spawnY'] ?? -1)],
            'upgrades' => array_keys(array_filter([
                'Demon Heart' => $flag('extraSlot'),
                'Artisan Loaf' => $flag('ateArtisanBread'),
                'Vital Crystal' => $flag('usedAegisCrystal'),
                'Aegis Fruit' => $flag('usedAegisFruit'),
                'Arcane Crystal' => $flag('usedArcaneCrystal'),
                'Galaxy Pearl' => $flag('usedGalaxyPearl'),
                'Gummy Worm' => $flag('usedGummyWorm'),
                'Ambrosia' => $flag('usedAmbrosia'),
                'Minecart Upgrade Kit' => $flag('unlockedSuperCart'),
                'Torch God\'s Favor' => $flag('unlockedBiomeTorches'),
            ])),
        ];
    }

    private static function time(int $ticks): string
    {
        return gmdate('c', intdiv($ticks - self::TICKS_AT_EPOCH, 10_000_000));
    }
}
