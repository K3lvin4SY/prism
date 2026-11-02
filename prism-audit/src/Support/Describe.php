<?php

declare(strict_types=1);

namespace PrismAudit\Support;

/** Admin event names in words, for alerts and the setting's choices. The page has its own fuller list. */
final class Describe
{
    public const array ADMIN = [
        'admin:server.create' => 'created a server',
        'admin:server.delete' => 'deleted a server',
        'admin:server.suspend' => 'suspended a server',
        'admin:server.transfer' => 'moved a server to another node',
        'admin:server.reinstall' => 'reinstalled a server',
        'admin:user.create' => 'created a user',
        'admin:user.update' => 'changed a user',
        'admin:user.delete' => 'deleted a user',
        'admin:user.disable-2fa' => 'turned off a user\'s two-factor authentication',
        'admin:api-key.create' => 'created an admin API key',
        'admin:node.create' => 'added a node',
        'admin:node.delete' => 'deleted a node',
        'admin:node.update' => 'changed a node',
        'admin:egg.delete' => 'deleted an egg',
        'admin:database-host.delete' => 'deleted a database host',
        'admin:mount.delete' => 'deleted a mount',
        'admin:theme.activate' => 'activated a theme',
    ];

    public static function event(string $event): string
    {
        return self::ADMIN[$event] ?? 'did '.$event;
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(static fn (string $event, string $label): array => ['value' => $event, 'label' => ucfirst($label)], array_keys(self::ADMIN), self::ADMIN);
    }
}
