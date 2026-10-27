<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support\Sources;

/**
 * A place mods come from: mod.io or the Steam Workshop. Both give mods in one shape so the
 * browser can show them side by side:
 *
 *  id            "modio:<id>" or "steam:<id>"
 *  source        modio | steam
 *  sourceId      the id at the source
 *  title, summary, author, icon, url
 *  downloads     total downloads or subscriptions
 *  score         0..1 rating, or null
 *  size          bytes
 *  created, updated  unix seconds
 *  categories    Core Keeper's types (Quality of Life, Library, ...)
 *  sides         Client and/or Server, as the author tagged it
 *  gameVersions  such as 1.3.0
 *  dependencies  ids in the same "source:id" form
 *  version       the file's version, when the source names one
 *  file          mod.io only: {id, url, filename, size, md5}
 *  body, screenshots  in details only
 */
interface Source
{
    /**
     * @param  array{query?: string, sort?: string, categories?: list<string>, sides?: list<string>, gameVersion?: string|null, page?: int, limit?: int}  $params
     * @return array{total: int, hits: list<array<string, mixed>>}
     */
    public function search(array $params): array;

    /**
     * @param  list<string>  $ids  ids at the source, without the prefix
     * @return array<string, array<string, mixed>> keyed by "source:id"
     */
    public function details(array $ids): array;

    public function configured(): bool;
}
