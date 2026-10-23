<?php

declare(strict_types=1);

namespace PrismBackups\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PrismBackups\Support\Access;
use PrismBackups\Support\Profiles;
use PrismBackups\Support\Settings;
use Pterodactyl\Models\Server;

/** Backup profiles: what a backup includes. Changing them needs permission to make backups. */
class ProfilesController
{
    public static function present(object $profile): array
    {
        return [
            'id' => (int) $profile->id,
            'name' => (string) $profile->name,
            'mode' => (string) $profile->mode,
            'patterns' => (string) $profile->patterns,
            'applyPteroignore' => (bool) $profile->apply_pteroignore,
            'lockBackups' => (bool) $profile->lock_backups,
            'isDefault' => (bool) $profile->is_default,
            'updatedAt' => (string) $profile->updated_at,
        ];
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server);
        abort_if(DB::table('prism_backup_profiles')->where('server_id', $server->id)->count() >= Settings::int('max_profiles', 10), 422, 'This server has as many profiles as the administrator allows.');
        $data = $this->validated($request, $server, null);

        $id = DB::transaction(function () use ($server, $data): int {
            if ($data['is_default']) {
                DB::table('prism_backup_profiles')->where('server_id', $server->id)->update(['is_default' => false]);
            }

            return (int) DB::table('prism_backup_profiles')->insertGetId([...$data, 'server_id' => $server->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return new JsonResponse(['profile' => self::present(DB::table('prism_backup_profiles')->find($id))], 201);
    }

    public function update(Request $request, Server $server, int $profile): JsonResponse
    {
        $this->authorize($request, $server);
        $existing = $this->find($server, $profile);
        $data = $this->validated($request, $server, $existing->id);

        DB::transaction(function () use ($server, $existing, $data): void {
            if ($data['is_default']) {
                DB::table('prism_backup_profiles')->where('server_id', $server->id)->where('id', '!=', $existing->id)->update(['is_default' => false]);
            }

            DB::table('prism_backup_profiles')->where('id', $existing->id)->update([...$data, 'updated_at' => now()]);
            // Backups made with the old name keep showing it under the new one.
            if ($existing->name !== $data['name']) {
                DB::table('prism_backup_meta')->where('server_id', $server->id)->where('profile', $existing->name)->update(['profile' => $data['name']]);
            }
        });

        return new JsonResponse(['profile' => self::present(DB::table('prism_backup_profiles')->find($existing->id))]);
    }

    public function destroy(Request $request, Server $server, int $profile): Response
    {
        $this->authorize($request, $server);
        DB::table('prism_backup_profiles')->where('id', $this->find($server, $profile)->id)->delete();

        return response()->noContent();
    }

    private function authorize(Request $request, Server $server): void
    {
        Access::require($request, $server, 'backup.create', 'Changing backup profiles needs permission to make backups.');
        Access::feature($request, $server, 'feature_profiles');
    }

    private function find(Server $server, int $id): object
    {
        $profile = DB::table('prism_backup_profiles')->where('server_id', $server->id)->where('id', $id)->first();
        abort_if($profile === null, 404, 'That profile does not exist.');

        return $profile;
    }

    /** @return array{name: string, mode: string, patterns: string, apply_pteroignore: bool, lock_backups: bool, is_default: bool} */
    private function validated(Request $request, Server $server, ?int $ignore): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:64', 'regex:/^[\pL\pN _.\-]+$/u', Rule::unique('prism_backup_profiles', 'name')->where('server_id', $server->id)->ignore($ignore)],
            'mode' => ['required', Rule::in(['exclude', 'include'])],
            'patterns' => ['present', 'nullable', 'string', 'max:20000'],
            'applyPteroignore' => ['boolean'],
            'lockBackups' => ['boolean'],
            'isDefault' => ['boolean'],
        ], [
            'name.regex' => 'A profile name may use letters, numbers, spaces, dots, dashes and underscores.',
            'name.unique' => 'This server already has a profile with that name.',
        ]);

        $patterns = implode("\n", Profiles::patterns((string) ($data['patterns'] ?? '')));
        abort_if($data['mode'] === 'include' && count(Profiles::includeLines(Profiles::patterns($patterns))) < 2, 422, 'Pick at least one file or folder to back up.');

        return [
            'name' => mb_trim($data['name']),
            'mode' => $data['mode'],
            'patterns' => $patterns,
            'apply_pteroignore' => (bool) ($data['applyPteroignore'] ?? false),
            'lock_backups' => (bool) ($data['lockBackups'] ?? false),
            'is_default' => (bool) ($data['isDefault'] ?? false),
        ];
    }
}
