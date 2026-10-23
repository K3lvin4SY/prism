import type { Condition, ScheduleInput, Step, StepType, Trigger } from './api';
import { newStep } from './steps';

export type PresetGame = 'Any game' | 'Minecraft' | 'Rust' | 'ARK' | 'Valheim' | 'Discord';

export interface Preset {
    game: PresetGame;
    name: string;
    description: string;
    icon: string;
    build: () => ScheduleInput;
}

const step = (type: StepType, config: Record<string, unknown> = {}, extra: Partial<Step> = {}): Step => {
    const made = newStep(type);

    return { ...made, config: { ...made.config, ...config }, ...extra };
};

const cron = (expression: string): Trigger => ({ type: 'cron', cron: expression });

const schedule = (name: string, trigger: Trigger, steps: Step[], conditions: Condition[] = [], color: string | null = null): ScheduleInput => ({
    name,
    enabled: true,
    color,
    trigger,
    conditions: { all: conditions, lastSucceeded: false },
    steps,
});

const warnings = (seconds: number, command = 'say {message}', message = 'The server restarts in {time}') => step('countdown', { seconds, command, message, marks: [3600, 1800, 900, 600, 300, 60, 30, 10, 5, 4, 3, 2, 1].filter((mark) => mark <= seconds) });

/** Ready-made schedules; each opens in the editor to change before it is saved. */
export const PRESETS: Preset[] = [
    // Any game
    { game: 'Any game', name: 'Daily restart with warnings', icon: 'rotate-cw', description: 'Every night at 04:00: ten minutes of warnings, then a restart.', build: () => schedule('Daily restart', cron('0 4 * * *'), [warnings(600), step('power', { signal: 'restart' })], [], '#3b82f6') },
    { game: 'Any game', name: 'Restart every 6 hours', icon: 'refresh-cw', description: 'Five minutes of warnings, then a restart, four times a day.', build: () => schedule('Restart every 6 hours', cron('0 */6 * * *'), [warnings(300), step('power', { signal: 'restart' })], [], '#6366f1') },
    { game: 'Any game', name: 'Crash recovery', icon: 'life-buoy', description: 'When the server crashes, wait a moment, start it and check it comes up.', build: () => schedule('Crash recovery', { type: 'crash' }, [step('wait', { seconds: 10 }), step('power', { signal: 'start' }, { retries: 2 }), step('waitFor', { state: 'running', timeout: 300 })], [], '#ef4444') },
    { game: 'Any game', name: 'Hourly backup', icon: 'archive', description: 'A backup at the top of every hour; the oldest is replaced at the limit.', build: () => schedule('Hourly backup', cron('0 * * * *'), [step('backup')], [], '#22c55e') },
    { game: 'Any game', name: 'Weekly locked backup', icon: 'lock', description: 'Sunday at 03:00, a backup that is kept until you unlock it.', build: () => schedule('Weekly backup', cron('0 3 * * 0'), [step('backup', { name: 'Weekly {date}', locked: true })], [], '#14b8a6') },
    { game: 'Any game', name: 'Stop overnight', icon: 'moon', description: 'Warn, then stop the server at 01:00 to save resources.', build: () => schedule('Stop overnight', cron('0 1 * * *'), [warnings(300, 'say {message}', 'The server shuts down for the night in {time}'), step('power', { signal: 'stop' })], [], '#64748b') },
    { game: 'Any game', name: 'Start in the morning', icon: 'sunrise', description: 'Start the server at 08:00 if it is not running.', build: () => schedule('Start in the morning', cron('0 8 * * *'), [step('power', { signal: 'start' })], [{ type: 'offline' }], '#f59e0b') },
    { game: 'Any game', name: 'Stop, or kill if it hangs', icon: 'octagon-x', description: 'Ask the server to stop; if it is still up after a minute, kill it.', build: () => schedule('Stop or kill', { type: 'manual' }, [step('power', { signal: 'stop' }), step('waitFor', { state: 'offline', timeout: 60 }, { continueOnFailure: true }), { ...step('if', { type: 'online' }), then: [step('power', { signal: 'kill' })], else: [] }]) },
    { game: 'Any game', name: 'Backup, then restart', icon: 'archive-restore', description: 'A backup first, then a restart once it has had time to finish.', build: () => schedule('Backup and restart', cron('30 4 * * *'), [warnings(300), step('backup'), step('wait', { seconds: 60 }), step('power', { signal: 'restart' })]) },

    // Minecraft
    { game: 'Minecraft', name: 'Safe restart', icon: 'shield-check', description: 'Fifteen minutes of warnings, save the world, then restart.', build: () => schedule('Safe restart', cron('0 5 * * *'), [warnings(900), step('command', { command: 'save-all' }), step('wait', { seconds: 10 }), step('power', { signal: 'restart' })], [], '#3b82f6') },
    { game: 'Minecraft', name: 'Clean backup', icon: 'database-backup', description: 'Turn saving off, flush the world, back up, then turn saving back on.', build: () => schedule('Clean backup', cron('0 */4 * * *'), [step('command', { command: 'save-off' }), step('command', { command: 'save-all flush' }), step('wait', { seconds: 15 }), step('backup', {}, { continueOnFailure: true }), step('wait', { seconds: 60 }), step('command', { command: 'save-on' })], [{ type: 'online' }], '#22c55e') },
    { game: 'Minecraft', name: 'Autosave', icon: 'save', description: 'Save the world every 15 minutes while the server is up.', build: () => schedule('Autosave', cron('*/15 * * * *'), [step('command', { command: 'save-all' })], [{ type: 'online' }]) },
    { game: 'Minecraft', name: 'Restart when empty', icon: 'user-x', description: 'Restart once nobody has been online for 30 minutes.', build: () => schedule('Restart when empty', { type: 'empty', minutes: 30 }, [step('power', { signal: 'restart' })], [], '#a855f7') },
    { game: 'Minecraft', name: 'Night restart if few players', icon: 'users', description: 'At 03:00, restart with warnings only if fewer than 3 players are on.', build: () => schedule('Night restart', cron('0 3 * * *'), [{ ...step('if', { type: 'players_below', count: 3 }), then: [warnings(300), step('power', { signal: 'restart' })], else: [step('command', { command: 'say Restart skipped: too many players online.' })] }]) },
    { game: 'Minecraft', name: 'Broadcast a message', icon: 'megaphone', description: 'Tell players something every 30 minutes.', build: () => schedule('Broadcast', cron('*/30 * * * *'), [step('command', { command: 'say Join our Discord!' })], [{ type: 'online' }]) },
    { game: 'Minecraft', name: 'Clear the weather', icon: 'cloud-sun', description: 'Clear rain and storms every 20 minutes.', build: () => schedule('Clear weather', cron('*/20 * * * *'), [step('command', { command: 'weather clear' })], [{ type: 'online' }]) },

    // Rust
    { game: 'Rust', name: 'Restart with warnings', icon: 'rotate-cw', description: 'Fifteen minutes of warnings, save, then restart.', build: () => schedule('Rust restart', cron('0 6 * * *'), [warnings(900), step('command', { command: 'server.save' }), step('wait', { seconds: 10 }), step('power', { signal: 'restart' })], [], '#f97316') },
    { game: 'Rust', name: 'Save every 10 minutes', icon: 'save', description: 'Run server.save while the server is up.', build: () => schedule('Rust save', cron('*/10 * * * *'), [step('command', { command: 'server.save' })], [{ type: 'online' }]) },
    { game: 'Rust', name: 'Thursday wipe restart', icon: 'calendar-days', description: 'Thursday at 18:00, an hour of warnings, then a restart for the update.', build: () => schedule('Wipe day restart', cron('0 18 * * 4'), [warnings(3600), step('command', { command: 'server.save' }), step('power', { signal: 'restart' })], [], '#ea580c') },

    // ARK
    { game: 'ARK', name: 'Restart with warnings', icon: 'rotate-cw', description: 'Warnings with broadcast, save the world, then restart.', build: () => schedule('ARK restart', cron('0 5 * * *'), [warnings(900, 'broadcast {message}'), step('command', { command: 'saveworld' }), step('wait', { seconds: 15 }), step('power', { signal: 'restart' })], [], '#84cc16') },
    { game: 'ARK', name: 'Save every 30 minutes', icon: 'save', description: 'Run saveworld while the server is up.', build: () => schedule('ARK save', cron('*/30 * * * *'), [step('command', { command: 'saveworld' })], [{ type: 'online' }]) },

    // Valheim
    { game: 'Valheim', name: 'Nightly restart', icon: 'rotate-cw', description: 'Valheim has no console commands: stop, wait until it is down, start.', build: () => schedule('Valheim restart', cron('0 5 * * *'), [step('power', { signal: 'stop' }), step('waitFor', { state: 'offline', timeout: 120 }), step('power', { signal: 'start' })], [], '#0ea5e9') },
    { game: 'Valheim', name: 'Backup before restart', icon: 'archive', description: 'Back up the worlds, then restart.', build: () => schedule('Valheim backup and restart', cron('30 4 * * *'), [step('backup'), step('wait', { seconds: 90 }), step('power', { signal: 'restart' })]) },

    // Discord
    { game: 'Discord', name: 'Crash alert', icon: 'siren', description: 'Post to Discord when the server crashes, then start it again.', build: () => schedule('Crash alert', { type: 'crash' }, [step('discord', { content: ':warning: **{server}** crashed. Starting it again.' }, { continueOnFailure: true }), step('power', { signal: 'start' })], [], '#ef4444') },
    { game: 'Discord', name: 'Restart notice', icon: 'bell-ring', description: 'Tell Discord and the players before the nightly restart.', build: () => schedule('Restart notice', cron('0 4 * * *'), [step('discord', { content: '**{server}** restarts in 10 minutes.' }, { continueOnFailure: true }), warnings(600), step('power', { signal: 'restart' }), step('waitFor', { state: 'running', timeout: 600 }), step('discord', { content: '**{server}** is back up.' }, { continueOnFailure: true })]) },
    { game: 'Discord', name: 'Daily status', icon: 'message-square', description: 'Every day at noon: uptime and players.', build: () => schedule('Daily status', cron('0 12 * * *'), [step('discord', { content: '**{server}** has been up for {uptime}. Players online: {players}.' })]) },
];

export const GAMES: ('All' | PresetGame)[] = ['All', 'Any game', 'Minecraft', 'Rust', 'ARK', 'Valheim', 'Discord'];
