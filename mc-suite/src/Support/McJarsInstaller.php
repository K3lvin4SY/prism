<?php

declare(strict_types=1);

namespace McSuite\Support;

/**
 * Turns an mcjars build into install-plan steps: the old jar is moved aside, the build's own
 * download, unzip and remove steps run on Wings, and what was installed is recorded.
 */
final class McJarsInstaller
{
    /**
     * @param  array<string, mixed>  $build  a build from McJars::build()
     * @return list<array<string, mixed>>
     */
    public static function steps(array $build, string $jar): array
    {
        $groups = $build['installation'] ?? [];
        abort_if(! is_array($groups) || $groups === [], 422, 'This build cannot be installed automatically.');

        $software = Detector::softwareForMcJars((string) ($build['type'] ?? ''));
        abort_if($software === null || $software === 'bedrock', 422, 'This software is not supported.');

        $steps = [['type' => 'rename', 'dir' => self::directoryOf($jar), 'from' => basename($jar), 'to' => basename($jar).'.old', 'optional' => true]];

        foreach ($groups as $group) {
            foreach ($group as $step) {
                $steps[] = match ($step['type'] ?? null) {
                    'download' => [
                        'type' => 'pull',
                        'url' => self::httpsUrl($step['url'] ?? ''),
                        'dir' => self::directoryOf($step['file'] === 'server.jar' ? $jar : $step['file']),
                        'file' => basename($step['file'] === 'server.jar' ? $jar : ServerFiles::normalize($step['file'])),
                        'size' => $step['size'] ?? null,
                    ],
                    'unzip' => ['type' => 'unzip', 'dir' => ServerFiles::normalize($step['location'] ?? ''), 'file' => ServerFiles::normalize($step['file'])],
                    'remove' => ['type' => 'delete', 'dir' => self::directoryOf($step['location']), 'files' => [basename(ServerFiles::normalize($step['location']))]],
                    default => abort(422, 'This build uses an install step MC Suite does not know.'),
                };
            }
        }

        if ($jar !== 'server.jar') {
            $steps[] = ['type' => 'rename', 'dir' => '', 'from' => 'server.jar', 'to' => $jar, 'optional' => true];
        }

        $steps[] = ['type' => 'record', 'key' => 'software', 'value' => [
            'software' => $software,
            'version' => $build['versionId'] ?? null,
            'build' => $build['projectVersionId'] ?? $build['name'] ?? null,
            'buildId' => $build['id'] ?? null,
            'installed' => now()->toAtomString(),
        ]];
        $steps[] = ['type' => 'refresh'];

        return $steps;
    }

    public static function softwareFor(array $build): ?string
    {
        return Detector::softwareForMcJars((string) ($build['type'] ?? ''));
    }

    private static function directoryOf(string $path): string
    {
        $path = ServerFiles::normalize($path);

        return str_contains($path, '/') ? dirname($path) : '';
    }

    private static function httpsUrl(string $url): string
    {
        abort_unless(preg_match('#^https://[^\s/]+/\S+$#', $url) === 1, 422, 'The build has an invalid download link.');

        return $url;
    }
}
