<?php

declare(strict_types=1);

namespace PrismSchedules\Http\Controllers;

use Cron\CronExpression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PrismSchedules\Models\PrismSchedule;
use PrismSchedules\Models\ScheduleRun;
use PrismSchedules\Support\Engine;
use PrismSchedules\Support\Players;
use PrismSchedules\Support\Settings;
use PrismSchedules\Support\Steps;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

class SchedulesController
{
    /** The schedules with their coming runs, recent runs, other servers to copy to, and the admin's settings. */
    public function state(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.read', 'You do not have permission to see schedules.');
        $user = $request->user();

        $schedules = PrismSchedule::query()->where('server_id', $server->id)->orderBy('name')->get();
        $runs = ScheduleRun::query()->where('server_id', $server->id)->latest('id')->limit(30)->get();

        return new JsonResponse([
            'config' => Settings::frontend(),
            'timezone' => config('app.timezone'),
            'minecraft' => Players::supported($server),
            'permissions' => [
                'create' => $user->can('schedule.create', $server),
                'update' => $user->can('schedule.update', $server),
                'delete' => $user->can('schedule.delete', $server),
            ],
            'schedules' => $schedules->map(fn (PrismSchedule $schedule): array => $this->present($schedule))->values(),
            'runs' => $runs->map(static fn (ScheduleRun $run): array => $run->present())->values(),
            'servers' => $this->copyTargets($user, $server),
        ]);
    }

    /** Whether a cron expression is valid, and when it fires next. */
    public function cron(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.read', 'You do not have permission to see schedules.');
        $cron = (string) $request->input('cron', '');
        if (! CronExpression::isValidExpression($cron)) {
            return new JsonResponse(['valid' => false, 'next' => []]);
        }

        return new JsonResponse(['valid' => true, 'next' => array_slice(Engine::upcoming($cron, 400, 5), 0, 5)]);
    }

    public function store(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.create', 'You do not have permission to make schedules.');
        abort_if(PrismSchedule::query()->where('server_id', $server->id)->count() >= Settings::int('max_schedules', 25), 422, 'This server has as many schedules as the administrator allows.');

        $schedule = new PrismSchedule(['server_id' => $server->id]);
        $schedule->forceFill($this->validated($request, $server, null))->save();

        return new JsonResponse(['schedule' => $this->present($schedule->fresh())], 201);
    }

    public function update(Request $request, Server $server, int $schedule): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.update', 'You do not have permission to change schedules.');
        $record = $this->find($server, $schedule);
        $record->forceFill($this->validated($request, $server, $record))->save();

        return new JsonResponse(['schedule' => $this->present($record->fresh())]);
    }

    public function destroy(Request $request, Server $server, int $schedule): Response
    {
        $this->authorize($request, $server, 'schedule.delete', 'You do not have permission to delete schedules.');
        $record = $this->find($server, $schedule);
        ScheduleRun::query()->where('schedule_id', $record->id)->where('status', 'running')->get()->each(static fn (ScheduleRun $run) => Engine::finish($run, 'cancelled', 'The schedule was deleted.'));
        $record->delete();

        return response()->noContent();
    }

    /** Runs the schedule now. Its conditions are not checked: asking for it is reason enough. */
    public function run(Request $request, Server $server, int $schedule): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.update', 'You do not have permission to run schedules.');
        $record = $this->find($server, $schedule);
        $this->requireStepPermissions($request, $server, $record->steps);
        abort_if(ScheduleRun::query()->where('schedule_id', $record->id)->where('status', 'running')->exists(), 409, 'This schedule is running already.');

        $run = Engine::start($record, 'manual', $request->user()->id, false);
        abort_if($run === null, 409, 'The server is busy installing, transferring or restoring.');

        return new JsonResponse(['run' => $run->present(true)], 202);
    }

    public function pause(Request $request, Server $server, int $schedule): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.update', 'You do not have permission to change schedules.');
        $record = $this->find($server, $schedule);
        $data = $request->validate(['until' => ['nullable', 'date', 'after:now']]);
        $record->forceFill(['paused_until' => isset($data['until']) ? Carbon::parse($data['until']) : null])->save();

        return new JsonResponse(['schedule' => $this->present($record)]);
    }

    /** Copies the schedule to other servers the person may make schedules on. */
    public function copy(Request $request, Server $server, int $schedule): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.read', 'You do not have permission to see schedules.');
        $record = $this->find($server, $schedule);
        $data = $request->validate(['servers' => ['required', 'array', 'min:1', 'max:50'], 'servers.*' => ['string']]);
        $user = $request->user();

        $copied = [];
        foreach (Server::query()->whereIn('uuidShort', $data['servers'])->where('id', '!=', $server->id)->get() as $target) {
            if (! $user->can('schedule.create', $target) || PrismSchedule::query()->where('server_id', $target->id)->count() >= Settings::int('max_schedules', 25)) {
                continue;
            }

            if (array_diff(Steps::permissions($record->steps), array_filter(Steps::permissions($record->steps), static fn (string $permission): bool => $user->can($permission, $target))) !== []) {
                continue;
            }

            $copy = $record->replicate(['next_run_at', 'last_run_at', 'last_status', 'paused_until']);
            $copy->server_id = $target->id;
            // "Run another schedule" names a schedule on this server, which the copy cannot.
            $copy->steps = self::withoutRunTargets($record->steps);
            $copy->next_run_at = ($copy->trigger['type'] ?? null) === 'cron' ? Engine::nextRun((string) $copy->trigger['cron']) : null;
            $copy->save();
            $copied[] = $target->name;
        }

        abort_if($copied === [], 422, 'It could not be copied to any of those servers. You need permission there to make schedules and run each of its steps.');

        return new JsonResponse(['copied' => $copied]);
    }

    public function runs(Request $request, Server $server, int $schedule): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.read', 'You do not have permission to see schedules.');
        $record = $this->find($server, $schedule);

        return new JsonResponse(['runs' => $record->runs()->latest('id')->limit(50)->get()->map(static fn (ScheduleRun $run): array => $run->present())->values()]);
    }

    public function showRun(Request $request, Server $server, int $run): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.read', 'You do not have permission to see schedules.');
        $record = ScheduleRun::query()->where('server_id', $server->id)->findOrFail($run);

        return new JsonResponse(['run' => $record->present(true)]);
    }

    public function stop(Request $request, Server $server, int $run): JsonResponse
    {
        $this->authorize($request, $server, 'schedule.update', 'You do not have permission to stop schedules.');
        $record = ScheduleRun::query()->with('schedule')->where('server_id', $server->id)->findOrFail($run);
        if (! $record->finished()) {
            Engine::finish($record, 'cancelled', 'Stopped by '.$request->user()->username.'.');
        }

        return new JsonResponse(['run' => $record->present(true)]);
    }

    private function authorize(Request $request, Server $server, string $permission, string $message): void
    {
        abort_unless(Settings::bool('enabled', true), 403, 'The administrator has turned Prism Schedules off.');
        abort_unless($request->user()->can($permission, $server), 403, $message);
    }

    private function find(Server $server, int $id): PrismSchedule
    {
        $schedule = PrismSchedule::query()->where('server_id', $server->id)->find($id);
        abort_if($schedule === null, 404, 'That schedule does not exist.');

        return $schedule;
    }

    private function requireStepPermissions(Request $request, Server $server, array $steps): void
    {
        foreach (Steps::permissions($steps) as $permission) {
            abort_unless($request->user()->can($permission, $server), 403, sprintf('A step needs the %s permission, which you do not have.', $permission));
        }
    }

    private function validated(Request $request, Server $server, ?PrismSchedule $existing): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'enabled' => ['boolean'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'trigger' => ['required', 'array'],
            'trigger.type' => ['required', Rule::in(Engine::TRIGGERS)],
            'trigger.cron' => ['nullable', 'string', 'max:100'],
            'trigger.minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'conditions' => ['nullable', 'array'],
            'conditions.all' => ['nullable', 'array', 'max:10'],
            'conditions.lastSucceeded' => ['nullable', 'boolean'],
            'steps' => ['present', 'array'],
        ]);

        $trigger = ['type' => $data['trigger']['type']];
        if ($trigger['type'] === 'cron') {
            $cron = mb_trim((string) ($data['trigger']['cron'] ?? ''));
            abort_unless(CronExpression::isValidExpression($cron), 422, 'That is not a valid schedule time.');
            $trigger['cron'] = $cron;
        }
        if (in_array($trigger['type'], ['start', 'stop', 'crash'], true)) {
            abort_unless(Settings::bool('feature_state_triggers', true), 422, 'The administrator has turned off start, stop and crash triggers.');
        }
        if ($trigger['type'] === 'empty') {
            abort_unless(Settings::bool('feature_empty_trigger', true) && Players::supported($server), 422, 'The "server is empty" trigger only works for Minecraft servers.');
            $trigger['minutes'] = (int) ($data['trigger']['minutes'] ?? 10);
        }

        $steps = Steps::normalize($data['steps'], $existing?->steps ?? []);
        abort_if(count(Steps::flatten($steps)) > Settings::int('max_steps', 50), 422, sprintf('A schedule can have at most %d steps.', Settings::int('max_steps', 50)));
        $this->requireStepPermissions($request, $server, $steps);
        foreach (Steps::flatten($steps) as $step) {
            if ($step['type'] === 'run' && $step['config']['schedule'] !== null) {
                abort_unless(PrismSchedule::query()->where('server_id', $server->id)->where('id', $step['config']['schedule'])->where('id', '!=', $existing?->id ?? 0)->exists(), 422, 'A "Run another schedule" step names a schedule this server does not have.');
            }
        }

        $conditions = [
            'all' => array_map(static fn ($condition): array => Steps::condition(is_array($condition) ? $condition : []), $data['conditions']['all'] ?? []),
            'lastSucceeded' => (bool) ($data['conditions']['lastSucceeded'] ?? false),
        ];

        return [
            'name' => mb_trim($data['name']),
            'enabled' => (bool) ($data['enabled'] ?? true),
            'color' => $data['color'] ?? null,
            'trigger' => $trigger,
            'conditions' => $conditions,
            'steps' => $steps,
            'next_run_at' => $trigger['type'] === 'cron' ? Engine::nextRun($trigger['cron']) : null,
        ];
    }

    private function present(PrismSchedule $schedule): array
    {
        $cron = ($schedule->trigger['type'] ?? null) === 'cron' ? (string) $schedule->trigger['cron'] : null;

        return [
            'id' => $schedule->id,
            'name' => $schedule->name,
            'enabled' => $schedule->enabled,
            'color' => $schedule->color,
            'trigger' => $schedule->trigger,
            'conditions' => $schedule->conditions ?? ['all' => [], 'lastSucceeded' => false],
            'steps' => Steps::present($schedule->steps ?? []),
            'pausedUntil' => $schedule->paused() ? $schedule->paused_until->toIso8601String() : null,
            'nextRunAt' => $schedule->next_run_at?->toIso8601String(),
            'lastRunAt' => $schedule->last_run_at?->toIso8601String(),
            'lastStatus' => $schedule->last_status,
            'upcoming' => $cron !== null && $schedule->enabled ? Engine::upcoming($cron, 8, 200) : [],
        ];
    }

    /** @return list<array{identifier: string, name: string}> */
    private function copyTargets(User $user, Server $server): array
    {
        try {
            $query = $user->root_admin ? Server::query() : $user->accessibleServers();
        } catch (Throwable) {
            return [];
        }

        return $query->where('servers.id', '!=', $server->id)->orderBy('name')->limit(100)->get(['servers.id', 'servers.uuidShort', 'servers.name', 'servers.owner_id'])
            ->filter(static fn (Server $target): bool => $user->can('schedule.create', $target))
            ->map(static fn (Server $target): array => ['identifier' => $target->uuidShort, 'name' => $target->name])
            ->values()
            ->all();
    }

    private static function withoutRunTargets(array $steps): array
    {
        return array_map(static function (array $step): array {
            if ($step['type'] === 'run') {
                $step['config']['schedule'] = null;
            }
            if ($step['type'] === 'if') {
                $step['then'] = self::withoutRunTargets($step['then'] ?? []);
                $step['else'] = self::withoutRunTargets($step['else'] ?? []);
            }

            return $step;
        }, $steps);
    }
}
