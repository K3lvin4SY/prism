/** What an activity entry says it did, as words that follow who did it: "signed in", "ran a command: say hi". */
export type Properties = Record<string, unknown>;

const text = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        const items = value.map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item && 'from' in item ? `${(item as { from: unknown }).from} → ${(item as { to?: unknown }).to}` : null)).filter((item): item is string => !!item);
        if (items.length === 0) return null;

        return items.length > 3 ? `${items.slice(0, 3).join(', ')} and ${items.length - 3} more` : items.join(', ');
    }

    return null;
};

/** A phrase with its detail when the entry has one: with('ran a command', props.command) → "ran a command: say hi". */
const with_ = (phrase: string, ...values: unknown[]) => {
    const detail = values.map(text).find((value) => value !== null);

    return detail ? `${phrase}: ${detail}` : phrase;
};

const files = (props: Properties) => {
    const list = text(props.files);
    const dir = text(props.directory);

    return list ? (dir && dir !== '/' ? `${list} in ${dir}` : list) : (text(props.file) ?? dir);
};

const EVENTS: Record<string, (props: Properties) => string> = {
    'auth:success': () => 'signed in',
    'auth:fail': (p) => with_('failed to sign in', p.user, p.username, p.email),
    'auth:checkpoint': () => 'was asked for a two-factor code',
    'auth:token': () => 'entered a two-factor code',
    'auth:recovery-token': () => 'signed in with a recovery code',
    'auth:password-reset': () => 'reset their password',
    'auth:reset-password': () => 'asked for a password reset',
    'auth:ip-blocked': () => 'was blocked from an IP address not allowed for their API key',
    'auth:sftp.fail': (p) => with_('failed to sign in over SFTP', p.method),

    'user:account.email-changed': (p) => (text(p.old) && text(p.new) ? `changed their email from ${text(p.old)} to ${text(p.new)}` : 'changed their email'),
    'user:account.password-changed': () => 'changed their password',
    'user:api-key.create': (p) => with_('created an API key', p.identifier),
    'user:api-key.delete': (p) => with_('deleted an API key', p.identifier),
    'user:ssh-key.create': (p) => with_('added an SSH key', p.fingerprint),
    'user:ssh-key.delete': (p) => with_('removed an SSH key', p.fingerprint),
    'user:two-factor.create': () => 'turned on two-factor authentication',
    'user:two-factor.delete': () => 'turned off two-factor authentication',
    'user:user.create': () => 'signed up',

    'server:power.start': () => 'started the server',
    'server:power.stop': () => 'stopped the server',
    'server:power.restart': () => 'restarted the server',
    'server:power.kill': () => 'killed the server',
    'server:console.command': (p) => with_('ran a command', p.command),
    'server:file.read': (p) => with_('opened a file', files(p)),
    'server:file.write': (p) => with_('saved a file', files(p)),
    'server:file.download': (p) => with_('downloaded a file', files(p)),
    'server:file.copy': (p) => with_('copied a file', files(p)),
    'server:file.rename': (p) => with_('renamed files', files(p)),
    'server:file.delete': (p) => with_('deleted files', files(p)),
    'server:file.chmod': (p) => with_('changed file permissions', files(p)),
    'server:file.compress': (p) => with_('compressed files', files(p)),
    'server:file.decompress': (p) => with_('unpacked an archive', files(p)),
    'server:file.create-directory': (p) => with_('made a folder', p.name),
    'server:file.pull': (p) => with_('downloaded a file from the web', p.url),
    'server:backup.start': (p) => with_('started a backup', p.name),
    'server:backup.complete': (p) => with_('finished a backup', p.name),
    'server:backup.fail': (p) => with_('had a backup fail', p.name),
    'server:backup.delete': (p) => with_('deleted a backup', p.name),
    'server:backup.download': (p) => with_('downloaded a backup', p.name),
    'server:backup.restore': (p) => with_('restored a backup', p.name),
    'server:backup.restore-complete': (p) => with_('finished restoring a backup', p.name),
    'server:backup.restore-failed': (p) => with_('had a backup restore fail', p.name),
    'server:backup.lock': (p) => with_('locked a backup', p.name),
    'server:backup.unlock': (p) => with_('unlocked a backup', p.name),
    'server:database.create': (p) => with_('created a database', p.name),
    'server:database.delete': (p) => with_('deleted a database', p.name),
    'server:database.rotate-password': (p) => with_('changed a database password', p.name),
    'server:schedule.create': (p) => with_('created a schedule', p.name),
    'server:schedule.update': (p) => with_('changed a schedule', p.name),
    'server:schedule.delete': (p) => with_('deleted a schedule', p.name),
    'server:schedule.execute': (p) => with_('ran a schedule', p.name),
    'server:task.create': (p) => with_('added a schedule task', p.name),
    'server:task.update': (p) => with_('changed a schedule task', p.name),
    'server:task.delete': (p) => with_('removed a schedule task', p.name),
    'server:subuser.create': (p) => with_('added a subuser', p.email),
    'server:subuser.update': (p) => with_('changed a subuser', p.email),
    'server:subuser.delete': (p) => with_('removed a subuser', p.email),
    'server:allocation.create': (p) => with_('added a port', p.allocation),
    'server:allocation.delete': (p) => with_('removed a port', p.allocation),
    'server:allocation.notes': (p) => with_('changed a port\'s notes', p.allocation),
    'server:allocation.primary': (p) => with_('changed the primary port', p.allocation),
    'server:settings.rename': (p) => (text(p.old) && text(p.new) ? `renamed the server from ${text(p.old)} to ${text(p.new)}` : 'renamed the server'),
    'server:settings.description': () => 'changed the server\'s description',
    'server:startup.edit': (p) => with_('changed a startup variable', p.variable),
    'server:startup.image': (p) => with_('changed the Docker image', p.new),
    'server:reinstall': () => 'reinstalled the server',
    'server:sftp.denied': () => 'was denied SFTP access',

    'admin:server.create': () => 'created a server',
    'admin:server.delete': () => 'deleted a server',
    'admin:server.build': () => 'changed a server\'s resources',
    'admin:server.details': () => 'changed a server\'s details',
    'admin:server.startup': () => 'changed a server\'s startup',
    'admin:server.suspend': () => 'suspended a server',
    'admin:server.unsuspend': () => 'unsuspended a server',
    'admin:server.transfer': () => 'moved a server to another node',
    'admin:server.reinstall': () => 'reinstalled a server',
    'admin:server.rebuild': () => 'rebuilt a server',
    'admin:user.create': () => 'created a user',
    'admin:user.update': () => 'changed a user',
    'admin:user.delete': () => 'deleted a user',
    'admin:user.disable-2fa': () => 'turned off a user\'s two-factor authentication',
    'admin:api-key.create': () => 'created an admin API key',
    'admin:api-key.update': () => 'changed an admin API key',
    'admin:api-key.delete': () => 'deleted an admin API key',
    'admin:node.create': () => 'added a node',
    'admin:node.update': () => 'changed a node',
    'admin:node.delete': () => 'deleted a node',
    'admin:theme.activate': () => 'activated a theme',
    'admin:theme.settings': () => 'changed theme settings',
};

/** "server:prism-notes.delete" → "used prism notes (delete)", for events this list does not know, such as other extensions'. */
function fallback(event: string): string {
    const rest = event.includes(':') ? event.slice(event.indexOf(':') + 1) : event;
    const words = (part: string) => part.replace(/[-_]/g, ' ');
    const parts = rest.split('.');
    if (parts.length < 2) return `did ${words(rest)}`;

    return `used ${parts.slice(0, -1).map(words).join(' ')} (${words(parts[parts.length - 1])})`;
}

export function describe(event: string, props: Properties = {}): string {
    const known = EVENTS[event];

    return known ? known(props) : fallback(event);
}

/** The family an event belongs to, for its color and the family filter. */
export function family(event: string): 'auth' | 'user' | 'server' | 'admin' | 'other' {
    const prefix = event.split(':', 1)[0];

    return prefix === 'auth' || prefix === 'user' || prefix === 'server' || prefix === 'admin' ? prefix : 'other';
}

/** "2026-11-02T13:37:29+01:00" → "2026-11-02" in the viewer's own time zone, to group entries by day. */
export function dayOf(timestamp: string): string {
    const date = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
