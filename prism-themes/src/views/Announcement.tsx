import { useState } from 'react';
import { NamedIcon, cn } from '@pterodactyl/sdk';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

const TONES = {
    info: { icon: 'info', className: 'bg-primary/15 text-foreground border-primary/30' },
    success: { icon: 'circle-check', className: 'bg-success/15 text-foreground border-success/30' },
    warning: { icon: 'triangle-alert', className: 'bg-warning/15 text-foreground border-warning/30' },
    danger: { icon: 'octagon-alert', className: 'bg-destructive/15 text-foreground border-destructive/30' },
} as const;

/** "2026-11-01 08:00" as a time, or null when empty or unreadable. */
const when = (text: string): number | null => {
    if (!text.trim()) return null;
    const time = Date.parse(text.trim().replace(' ', 'T'));

    return Number.isNaN(time) ? null : time;
};

const hash = (text: string) => {
    let value = 0;
    for (const char of text) value = (value * 31 + char.charCodeAt(0)) | 0;

    return String(value);
};

const KEY = 'prism-themes:dismissed';

function dismissed(): string | null {
    try {
        return window.localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

/** The admin's message, between its times, for its audience, until someone closes it. */
export default function Announcement({ model }: { model: AppLayoutModel }) {
    const settings = useSettings();
    const text = settings.announce_text?.trim() ?? '';
    const id = hash(text);
    const [closed, setClosed] = useState(() => dismissed() === id);

    if (!text || (closed && dismissed() === id)) return null;

    const now = Date.now();
    const from = when(settings.announce_from ?? '');
    const until = when(settings.announce_until ?? '');
    if ((from !== null && now < from) || (until !== null && now > until)) return null;
    if (settings.announce_audience === 'admins' && !model.user.rootAdmin) return null;
    if (settings.announce_audience === 'users' && model.user.rootAdmin) return null;

    const tone = TONES[settings.announce_level] ?? TONES.info;
    const link = /^https?:\/\//.test(settings.announce_link ?? '') ? settings.announce_link : null;
    const close = () => {
        try {
            window.localStorage.setItem(KEY, id);
        } catch {
            // Closed for this visit only.
        }
        setClosed(true);
    };

    const body = (
        <>
            <NamedIcon name={tone.icon} size={16} className='shrink-0' />
            <p className='min-w-0 flex-1 text-sm'>{text}</p>
            {link && (
                <a href={link} target='_blank' rel='noopener noreferrer' className='shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground no-underline hover:bg-primary/85'>
                    {settings.announce_link_label || 'Read more'}
                </a>
            )}
            {settings.announce_dismiss && (
                <button type='button' onClick={close} aria-label='Close' className='shrink-0 rounded p-1 text-muted-foreground hover:text-foreground'>
                    <NamedIcon name='x' size={14} />
                </button>
            )}
        </>
    );

    if (settings.announce_style === 'card') {
        return (
            <div className='mx-auto w-full max-w-panel px-4 pt-4'>
                <div role='status' className={cn('pt-surface flex items-center gap-3 rounded-lg border px-4 py-3', tone.className)}>
                    {body}
                </div>
            </div>
        );
    }

    return (
        <div role='status' className={cn('flex items-center gap-3 border-b px-4 py-2', tone.className)}>
            {body}
        </div>
    );
}
