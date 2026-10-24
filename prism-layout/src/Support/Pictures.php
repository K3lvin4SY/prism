<?php

declare(strict_types=1);

namespace PrismLayout\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Pterodactyl\Models\Server;

/**
 * Banner card pictures: each egg can have a default, and each server its own in place of it.
 * The files are kept on the local disk and served through the client API.
 */
final class Pictures
{
    public const string TABLE = 'prism_layout_pictures';

    private const string DIRECTORY = 'prism-layout/pictures';

    /** What an upload may be: an image, up to 2 MB. */
    public const array RULES = ['required', 'file', 'max:2048', 'mimetypes:image/png,image/jpeg,image/webp,image/gif,image/svg+xml'];

    public static function find(string $kind, int $target): ?object
    {
        return DB::table(self::TABLE)->where('kind', $kind)->where('target_id', $target)->first();
    }

    public static function url(object $row): string
    {
        return '/api/client/extensions/prism-layout/pictures/'.$row->id.'?v='.strtotime((string) $row->updated_at);
    }

    /** The server's own picture, else its egg's, with which one it is. */
    public static function forServer(Server $server): array
    {
        $own = self::find('server', $server->id);
        if ($own !== null) {
            return [$own, 'server'];
        }

        $egg = self::find('egg', $server->egg_id);

        return $egg !== null ? [$egg, 'egg'] : [null, null];
    }

    public static function store(string $kind, int $target, UploadedFile $file): void
    {
        $name = self::DIRECTORY.'/'.Str::random(32).'.'.($file->guessExtension() ?: 'img');
        Storage::disk('local')->putFileAs(self::DIRECTORY, $file, basename($name));

        $old = self::find($kind, $target);
        DB::table(self::TABLE)->updateOrInsert(['kind' => $kind, 'target_id' => $target], ['file' => $name, 'updated_at' => now(), 'created_at' => $old?->created_at ?? now()]);
        if ($old !== null) {
            Storage::disk('local')->delete($old->file);
        }
    }

    public static function remove(string $kind, int $target): void
    {
        $old = self::find($kind, $target);
        if ($old === null) {
            return;
        }

        DB::table(self::TABLE)->where('id', $old->id)->delete();
        Storage::disk('local')->delete($old->file);
    }
}
