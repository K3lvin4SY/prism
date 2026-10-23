<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Pterodactyl\Models\Server;

/**
 * A server's settings file, whichever it is: server.properties for Mojang's servers and the
 * Java forks, pumpkin.toml for Pumpkin. Both read and write server.properties keys.
 */
final class ServerProperties
{
    private const int MAX_FILE = 256_000;

    private function __construct(
        private readonly ServerFiles $files,
        public readonly string $file,
        private readonly PropertiesFile|PumpkinConfig $config,
        public readonly bool $exists,
    ) {}

    /** @param array<string, mixed>|null $info the Detector result, when the caller has it */
    public static function load(Server $server, ?array $info = null): self
    {
        $info ??= Detector::for($server)->info();
        $files = ServerFiles::for($server);

        if (($info['software'] ?? null) === 'pumpkin') {
            $content = $files->read(PumpkinConfig::FILE, self::MAX_FILE);

            return new self($files, PumpkinConfig::FILE, new PumpkinConfig($content ?? ''), $content !== null);
        }

        $content = $files->read('server.properties', self::MAX_FILE);

        return new self($files, 'server.properties', new PropertiesFile($content ?? '', ($info['edition'] ?? 'java') === 'java'), $content !== null);
    }

    public function isPumpkin(): bool
    {
        return $this->config instanceof PumpkinConfig;
    }

    /** The schema edition the keys belong to: java, bedrock or pumpkin. */
    public function schema(string $edition): string
    {
        return $this->isPumpkin() ? 'pumpkin' : $edition;
    }

    /** @return array<string, string> */
    public function all(): array
    {
        return $this->config->all();
    }

    public function get(string $key): ?string
    {
        return $this->config->get($key);
    }

    public function set(string $key, string $value): self
    {
        $this->config->set($key, $value);

        return $this;
    }

    public function pumpkin(): ?PumpkinConfig
    {
        return $this->config instanceof PumpkinConfig ? $this->config : null;
    }

    public function save(): void
    {
        $this->files->write($this->file, $this->config->toString());
    }
}
