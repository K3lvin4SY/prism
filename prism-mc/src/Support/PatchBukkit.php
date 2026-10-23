<?php

declare(strict_types=1);

namespace PrismMc\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use RuntimeException;

/**
 * PatchBukkit runs Paper, Spigot and Bukkit plugins on Pumpkin. It is a native Pumpkin plugin
 * in plugins/ that starts a JVM, so the server's image needs Java 25, and Pumpkin must be its
 * glibc build: the musl build is linked statically and cannot load native plugins.
 *
 * The Bukkit jars go in the folder PatchBukkit's config names, patchbukkit-plugins/ next to the
 * config unless changed. Builds differ on where the config is, so it is looked for in both
 * places it has lived; before PatchBukkit's first start, its install guide's folder is used.
 */
final class PatchBukkit
{
    /** Where the jars go before PatchBukkit has started once, as its install guide says. */
    public const string PLUGINS = 'patchbukkit/patchbukkit-plugins';

    /** Folders PatchBukkit keeps its config in, newest layout first. */
    private const array HOMES = ['patchbukkit', 'plugins/data/patchbukkit'];

    /** The startup variable of the Pumpkin egg that overrides where the binary comes from. */
    public const string DOWNLOAD_VARIABLE = 'DL_PATH';

    private const string PUMPKIN_DOWNLOADS = 'https://github.com/Pumpkin-MC/Pumpkin/releases/download/';

    public const int JAVA = 25;

    private const string API = 'https://api.github.com/repos/Pumpkin-MC/PatchBukkit/releases?per_page=20';

    private const string ASSET = '/^(lib)?patchbukkit-X64-Linux\.(so|zip)$/';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    /** The folder PatchBukkit loads Bukkit jars from on this server. */
    public function pluginFolder(): string
    {
        $files = ServerFiles::for($this->server);
        foreach (self::HOMES as $home) {
            if (! array_key_exists('patchbukkit.config.toml', $files->list($home))) {
                continue;
            }

            // [plugins] directory: the default sits in PatchBukkit's folder, any other relative
            // name in the folder above it, as PatchBukkit resolves it.
            $config = $files->read($home.'/patchbukkit.config.toml', 64_000) ?? '';
            $directory = TomlLines::scalar(TomlLines::get($config, 'plugins', 'directory')) ?? 'patchbukkit-plugins';
            if (str_contains($directory, '..') || str_contains($directory, "\0")) {
                return $home.'/patchbukkit-plugins';
            }

            $directory = ServerFiles::normalize(match (true) {
                str_starts_with($directory, '/home/container/') => substr($directory, 16),
                $directory === 'patchbukkit-plugins' => $home.'/'.$directory,
                default => (dirname($home) === '.' ? '' : dirname($home).'/').$directory,
            });

            return $directory !== '' ? $directory : $home.'/patchbukkit-plugins';
        }

        return self::PLUGINS;
    }

    /** Pumpkin's glibc build of a release tag, the one that can load PatchBukkit. */
    public static function glibcBinary(string $tag): string
    {
        return self::PUMPKIN_DOWNLOADS.rawurlencode($tag).'/pumpkin-X64-Linux';
    }

    /** Whether a DL_PATH value is empty or one Prism MC set, so Prism MC may change it. */
    public static function isOurDownload(?string $value): bool
    {
        return $value === null || $value === '' || str_starts_with($value, self::PUMPKIN_DOWNLOADS);
    }

    /** The installed library in plugins/, or null. */
    public function installed(): ?string
    {
        foreach (ServerFiles::for($this->server)->list('plugins') as $name => $file) {
            if ($file['file'] && preg_match('/^(lib)?patchbukkit.*\.(so|dll|dylib)$/i', $name)) {
                return $name;
            }
        }

        return null;
    }

    /** @return array<string, mixed>|null what Prism MC recorded when it installed PatchBukkit */
    public function record(): ?array
    {
        $record = Settings::server($this->server)->get('patchbukkit');

        return is_array($record) ? $record : null;
    }

    /** The Java version of the server's Docker image, read from tags like java_25, or null. */
    public function imageJava(): ?int
    {
        return self::javaOf((string) $this->server->image);
    }

    public static function javaOf(string $image): ?int
    {
        return preg_match('/java[_-]?(\d{1,2})\b/i', $image, $match) || preg_match('/:(\d{1,2})(?:[-.][\w.-]*)?$/', $image, $match) ? (int) $match[1] : null;
    }

    /**
     * The PatchBukkit build for a Pumpkin build: the release with the same tag (Pumpkin's rolling
     * builds match nothing, PatchBukkit's own nightly is older than its releases), else the newest
     * release, else that nightly.
     *
     * @return array{tag: string, name: string, url: string, file: string, size: int, zip: bool}
     */
    public function release(?string $pumpkinTag): array
    {
        $releases = self::releases();
        $match = null;
        foreach ($releases as $release) {
            if ($pumpkinTag !== null && ! in_array($pumpkinTag, ['nightly', 'canary'], true) && $release['tag'] === $pumpkinTag) {
                $match = $release;
            }
        }

        $match ??= collect($releases)->first(static fn (array $release): bool => $release['tag'] !== 'nightly')
            ?? collect($releases)->firstWhere('tag', 'nightly');
        throw_if($match === null, RuntimeException::class, 'PatchBukkit has no Linux build to download.');

        return $match;
    }

    /** @return list<array{tag: string, name: string, url: string, file: string, size: int, zip: bool}> */
    public static function releases(): array
    {
        return Cache::remember('ext:prism-mc:patchbukkit:releases', 3600, function (): array {
            $response = Http::withUserAgent(McJars::USER_AGENT)->acceptJson()->timeout(15)->get(self::API);
            throw_unless($response->successful() && is_array($response->json()), RuntimeException::class, 'GitHub did not answer: '.$response->status());

            $releases = [];
            foreach ($response->json() as $release) {
                foreach ($release['assets'] ?? [] as $asset) {
                    $url = (string) ($asset['browser_download_url'] ?? '');
                    if (preg_match(self::ASSET, (string) ($asset['name'] ?? ''), $match) && str_starts_with($url, 'https://github.com/Pumpkin-MC/PatchBukkit/releases/download/')) {
                        $releases[] = [
                            'tag' => (string) $release['tag_name'],
                            'name' => (string) ($release['name'] ?: $release['tag_name']),
                            'url' => $url,
                            'file' => (string) $asset['name'],
                            'size' => (int) $asset['size'],
                            'zip' => $match[2] === 'zip',
                        ];
                        break;
                    }
                }
            }

            return $releases;
        });
    }

    /**
     * Install steps: the old library goes, the new one is downloaded (and unpacked when the
     * release ships a zip) into plugins/, and the plugin folder is created for Bukkit jars.
     *
     * @param  array{tag: string, name: string, url: string, file: string, size: int, zip: bool}  $release
     * @return list<array<string, mixed>> InstallPlan steps
     */
    public function steps(array $release): array
    {
        // PatchBukkit makes its own folders on its first start.
        $steps = [['type' => 'mkdir', 'path' => 'plugins']];
        if (($old = $this->installed()) !== null) {
            $steps[] = ['type' => 'delete', 'dir' => 'plugins', 'files' => [$old]];
        }

        $steps[] = ['type' => 'pull', 'url' => $release['url'], 'dir' => 'plugins', 'file' => $release['file'], 'size' => $release['size']];
        if ($release['zip']) {
            $steps[] = ['type' => 'unzip', 'dir' => 'plugins', 'file' => $release['file']];
            $steps[] = ['type' => 'delete', 'dir' => 'plugins', 'files' => [$release['file']]];
        }

        $steps[] = ['type' => 'record', 'key' => 'patchbukkit', 'value' => ['tag' => $release['tag'], 'name' => $release['name'], 'installed' => now()->toAtomString()]];

        return $steps;
    }
}
