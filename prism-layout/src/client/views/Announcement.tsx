import { useEffect, useState } from 'react';
import { NamedIcon, cn } from '@pterodactyl/sdk';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

const TONES = {
    info: { icon: 'info', className: 'pla:bg-primary/15 pla:text-foreground pla:border-primary/30' },
    success: { icon: 'circle-check', className: 'pla:bg-success/15 pla:text-foreground pla:border-success/30' },
    warning: { icon: 'triangle-alert', className: 'pla:bg-warning/15 pla:text-foreground pla:border-warning/30' },
    danger: { icon: 'octagon-alert', className: 'pla:bg-destructive/15 pla:text-foreground pla:border-destructive/30' },
} as const;

/**
 * The moment a from or until value names, or null when empty or unreadable. Prism Properties saves
 * UTC ("2026-11-01T07:00:00.000Z"), so everyone sees the same moment; older "2026-11-01 08:00"
 * values are read in the viewer's own time.
 */
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

const KEY = 'prism-layout:dismissed';

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
    const [, tick] = useState(0);
    const from = when(settings.announce_from ?? '');
    const until = when(settings.announce_until ?? '');

    // Shows and hides the banner when its time comes, without a reload.
    useEffect(() => {
        const next = [from, until].filter((time): time is number => time !== null && time > Date.now()).sort((a, b) => a - b)[0];
        if (next === undefined || next - Date.now() > 86_400_000) return;
        const timer = window.setTimeout(() => tick((count) => count + 1), next - Date.now() + 500);

        return () => window.clearTimeout(timer);
    });

    if (!text || (closed && dismissed() === id)) return null;

    const now = Date.now();
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
            <NamedIcon name={tone.icon} size={16} className='pla:shrink-0' />
            <p className='pla:min-w-0 pla:flex-1 pla:text-sm'>{text}</p>
            {link && (
                <a href={link} target='_blank' rel='noopener noreferrer' className='pla:shrink-0 pla:rounded-md pla:bg-primary pla:px-3 pla:py-1 pla:text-xs pla:font-medium pla:text-primary-foreground pla:no-underline pla:hover:bg-primary/85'>
                    {settings.announce_link_label || 'Read more'}
                </a>
            )}
            {settings.announce_dismiss && (
                <button type='button' onClick={close} aria-label='Close' className='pla:shrink-0 pla:rounded pla:p-1 pla:text-muted-foreground pla:hover:text-foreground'>
                    <NamedIcon name='x' size={14} />
                </button>
            )}
        </>
    );

    if (settings.announce_style === 'card') {
        return (
            <div className='pla:mx-auto pla:w-full pla:max-w-panel pla:px-4 pla:pt-4'>
                <div role='status' className={cn('pt-surface pla:flex pla:items-center pla:gap-3 pla:rounded-lg pla:border pla:px-4 pla:py-3', tone.className)}>
                    {body}
                </div>
            </div>
        );
    }

    return (
        <div role='status' className={cn('pla:flex pla:items-center pla:gap-3 pla:border-b pla:px-4 pla:py-2', tone.className)}>
            {body}
        </div>
    );
}
