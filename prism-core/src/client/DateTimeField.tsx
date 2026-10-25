import { Button } from '@pterodactyl/sdk';

const pad = (value: number) => String(value).padStart(2, '0');

/** The saved value as the picker's "2026-11-01T08:00" in this browser's time, or '' when empty or unreadable. */
export function toLocalInput(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') return '';
    const time = Date.parse(value.trim().replace(' ', 'T'));
    if (Number.isNaN(time)) return '';
    const date = new Date(time);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The picker's local time as UTC, so everyone sees the same moment. */
export const fromLocalInput = (local: string): string => (local === '' ? '' : new Date(local).toISOString());

/** This browser's timezone, its short name now and its offset, such as Europe/Stockholm, CET, UTC+1. */
export function timezone(at = new Date()): { name: string; short: string; offset: string } {
    const name = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const part = (style: 'short' | 'longOffset') => new Intl.DateTimeFormat('en-GB', { timeZoneName: style }).formatToParts(at).find((item) => item.type === 'timeZoneName')?.value ?? '';
    const offset = part('longOffset').replace('GMT', 'UTC') || 'UTC';

    return { name, short: part('short'), offset: offset === 'UTC' ? 'UTC+0' : offset.replace(/:00$/, '') };
}

function relative(time: number): string {
    const minutes = Math.round((time - Date.now()) / 60_000);
    const abs = Math.abs(minutes);
    const text = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;

    return minutes >= 0 ? `in ${text}` : `${text} ago`;
}

/** A date and time picked in the admin's own time and saved as UTC, with the timezone spelled out. */
export default function DateTimeField({ value, onChange }: { value: unknown; onChange: (value: string) => void }) {
    const local = toLocalInput(value);
    const time = local ? Date.parse(new Date(local).toISOString()) : null;
    const zone = timezone(time ? new Date(time) : undefined);

    return (
        <div className={'ppx:flex ppx:flex-col ppx:gap-1.5'}>
            <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-2'}>
                <input
                    type={'datetime-local'}
                    value={local}
                    onChange={(event) => onChange(fromLocalInput(event.target.value))}
                    className={'ppx:rounded-md ppx:border ppx:border-input-border ppx:bg-input ppx:px-3 ppx:py-2 ppx:text-sm'}
                    style={{ colorScheme: document.documentElement.classList.contains('light') ? 'light' : 'dark' }}
                />
                {local && (
                    <Button.Text size={'small'} onClick={() => onChange('')}>
                        Clear
                    </Button.Text>
                )}
            </div>
            <p className={'ppx:text-xs ppx:text-muted-foreground'}>
                {time !== null && `${new Date(time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ${zone.short}, ${relative(time)}. `}
                Times are in your timezone, {zone.name} ({zone.short}, {zone.offset}); everyone sees the change at that same moment.
            </p>
        </div>
    );
}
