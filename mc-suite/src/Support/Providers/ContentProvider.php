<?php

declare(strict_types=1);

namespace McSuite\Support\Providers;

/**
 * A source of plugins, mods and modpacks. Modrinth is the only one today; CurseForge and
 * others can be added behind this interface without touching the controllers or the UI.
 *
 * Projects, versions and files are returned in one normalised shape:
 *  project: {id, slug, title, description, author, icon, downloads, follows, updated, categories, loaders, url}
 *  version: {id, projectId, name, number, type, loaders, gameVersions, published, downloads, files, dependencies}
 *  file:    {url, filename, size, sha1, sha512, primary}
 *  dependency: {projectId, versionId, type}   type: required|optional|incompatible|embedded
 */
interface ContentProvider
{
    public function id(): string;

    /**
     * @param  array{query?: string, type: string, loaders?: list<string>, gameVersion?: string|null, categories?: list<string>, sort?: string, offset?: int, limit?: int, serverSide?: bool}  $search
     * @return array{hits: list<array<string, mixed>>, total: int}
     */
    public function search(array $search): array;

    /** @return list<array{name: string, icon: string}> */
    public function categories(string $type): array;

    /** @return array<string, mixed> */
    public function project(string $id): array;

    /**
     * @param  list<string>  $loaders
     * @param  list<string>  $gameVersions
     * @return list<array<string, mixed>>
     */
    public function versions(string $projectId, array $loaders = [], array $gameVersions = []): array;

    /** @return array<string, mixed> */
    public function version(string $id): array;

    /**
     * The newest compatible version for each file hash.
     *
     * @param  list<string>  $sha1s
     * @param  list<string>  $loaders
     * @param  list<string>  $gameVersions
     * @return array<string, array<string, mixed>> keyed by the hash asked about
     */
    public function latestForHashes(array $sha1s, array $loaders, array $gameVersions): array;

    /**
     * The version each file hash belongs to.
     *
     * @param  list<string>  $sha1s
     * @return array<string, array<string, mixed>> keyed by hash
     */
    public function versionsForHashes(array $sha1s): array;

    /**
     * Projects by id, for names and icons of dependencies and installed files.
     *
     * @param  list<string>  $ids
     * @return array<string, array<string, mixed>> keyed by project id
     */
    public function projects(array $ids): array;
}
