import { useMemo, useState } from 'react';
import { Dialog, cn, formatDate, fromNow } from '@pterodactyl/sdk';
import { NamedIcon } from '../../icons';
import type { PlayerEvent } from '../../api/players';
import { prettyId } from '../../lib/player';

type Advancement = { id: string; date: string | null };

const EVENT_TEXT: Record<PlayerEvent['event'], { text: string; dot: string }> = {
    joined: { text: 'Joined the game', dot: 'mcs:bg-success' },
    left: { text: 'Left the game', dot: 'mcs:bg-muted-foreground' },
    lost: { text: 'Lost connection', dot: 'mcs:bg-muted-foreground' },
    kicked: { text: 'Was kicked', dot: 'mcs:bg-warning' },
    banned: { text: 'Was banned', dot: 'mcs:bg-destructive' },
    unbanned: { text: 'Was unbanned', dot: 'mcs:bg-primary' },
    opped: { text: 'Was made an operator', dot: 'mcs:bg-primary' },
    deopped: {
        text: 'Is no longer an operator',
        dot: 'mcs:bg-muted-foreground',
    },
    whitelisted: { text: 'Was whitelisted', dot: 'mcs:bg-primary' },
    unwhitelisted: {
        text: 'Was removed from the whitelist',
        dot: 'mcs:bg-muted-foreground',
    },
};

/** The advancement tabs in game order, each with its own color on the progress bar. */
const CATEGORIES: { id: string; label: string; color: string }[] = [
    { id: 'story', label: 'Minecraft', color: '#5fb85f' },
    { id: 'nether', label: 'Nether', color: '#d0533f' },
    { id: 'end', label: 'The End', color: '#b98ad8' },
    { id: 'adventure', label: 'Adventure', color: '#e0b23f' },
    { id: 'husbandry', label: 'Husbandry', color: '#4fb3c8' },
];
/** Datapacks' advancements are drawn in gray. */
const OTHER = { color: '#8a8f98' };

/** The hidden root of each tab, which the game grants on its own. */
const isRoot = (id: string) => /(^|[:/])root$/.test(id);

/** An advancement's tab and title. A datapack's own advancements are grouped under the datapack's name. */
function split(id: string) {
    const [namespace, path] = id.includes(':') ? id.split(':') : ['minecraft', id];
    const [category, ...rest] = path.split('/');
    if (namespace !== 'minecraft') return { category: namespace, title: prettyId(path.replace(/\//g, '_')) };

    return { category, title: prettyId(rest.join('_') || category) };
}

/** The tab an advancement belongs to: one of the game's, or a datapack shown in gray. */
function categoryOf(id: string) {
    return CATEGORIES.find((entry) => entry.id === id) ?? { id, label: prettyId(id), color: OTHER.color };
}

const SHOWN = 5;

interface Entry {
    key: string;
    time: string;
    dot: string;
    text: React.ReactNode;
    detail: string | null;
}

/** What the player did lately: joins and leaves from the log, and the advancements they made. */
export function RecentActivity({ events, advancements }: { events: PlayerEvent[]; advancements: Advancement[] }) {
    const [all, setAll] = useState(false);

    const entries = useMemo(() => {
        const list: Entry[] = [];
        events.forEach((event, index) => {
            if (!event.time) return;
            list.push({
                key: `e${index}`,
                time: event.time,
                dot: EVENT_TEXT[event.event].dot,
                text: EVENT_TEXT[event.event].text,
                detail: event.detail,
            });
        });
        advancements.forEach((item) => {
            if (!item.date || isRoot(item.id)) return;
            list.push({
                key: item.id,
                time: item.date,
                dot: 'mcs:bg-warning',
                text: (
                    <>
                        Made the advancement <span className={'mcs:text-warning'}>{split(item.id).title}</span>
                    </>
                ),
                detail: null,
            });
        });

        return list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 30);
    }, [events, advancements]);

    const shown = all ? entries : entries.slice(0, SHOWN);

    return (
        <section className={'mcs:flex mcs:flex-col mcs:gap-3'}>
            <header className={'mcs:flex mcs:items-center mcs:justify-between'}>
                <h3 className={'mcs:text-xs mcs:font-semibold mcs:tracking-wide mcs:text-muted-foreground mcs:uppercase'}>Recent</h3>
                {entries.length > SHOWN && (
                    <button type={'button'} onClick={() => setAll(!all)} className={'mcs:cursor-pointer mcs:text-xs mcs:text-muted-foreground mcs:hover:text-foreground'}>
                        {all ? 'Show less' : `Show all ${entries.length}`}
                    </button>
                )}
            </header>
            {entries.length === 0 ? (
                <p className={'mcs:text-sm mcs:text-muted-foreground'}>Nothing recorded yet.</p>
            ) : (
                <ol className={cn('mcs:flex mcs:flex-col mcs:gap-3', all && 'mcs:max-h-96 mcs:overflow-y-auto mcs:pr-1')}>
                    {shown.map((entry) => (
                        <li key={entry.key} className={'mcs:flex mcs:gap-3'}>
                            <span className={cn('mcs:mt-1.5 mcs:size-2 mcs:shrink-0 mcs:rounded-full', entry.dot)} />
                            <div className={'mcs:min-w-0'}>
                                <p className={'mcs:text-sm'}>
                                    {entry.text}
                                    {entry.detail && <span className={'mcs:text-muted-foreground'}> · {entry.detail}</span>}
                                </p>
                                <p className={'mcs:text-xs mcs:text-muted-foreground'} title={formatDate(entry.time, 'MMM D, YYYY HH:mm')}>
                                    {fromNow(entry.time)}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

/** How many advancements are done, as one bar split by tab, with the full list a click away. */
export function AdvancementsSummary({ items }: { items: Advancement[] }) {
    const [open, setOpen] = useState(false);
    const done = useMemo(() => items.filter((item) => !isRoot(item.id)), [items]);
    const groups = useMemo(() => {
        const counts = new Map<string, number>();
        done.forEach((item) => {
            const { category } = split(item.id);
            counts.set(category, (counts.get(category) ?? 0) + 1);
        });
        // The game's tabs in game order, then datapacks by size.
        const datapacks = [...counts.keys()].filter((id) => !CATEGORIES.some((entry) => entry.id === id)).sort((a, b) => counts.get(b)! - counts.get(a)!);

        return [...CATEGORIES.map((entry) => entry.id), ...datapacks].map((id) => ({ ...categoryOf(id), count: counts.get(id) ?? 0 })).filter((category) => category.count > 0);
    }, [done]);

    return (
        <section className={'mcs:flex mcs:flex-col mcs:gap-2.5'}>
            <button type={'button'} onClick={() => setOpen(true)} disabled={done.length === 0} className={'mcs:group mcs:flex mcs:cursor-pointer mcs:items-center mcs:justify-between mcs:gap-2 mcs:text-left mcs:disabled:cursor-default'}>
                <span className={'mcs:flex mcs:items-center mcs:gap-2 mcs:text-sm mcs:font-semibold'}>
                    <NamedIcon name={'trophy'} size={15} className={'mcs:text-warning'} /> Advancements
                </span>
                <span className={'mcs:flex mcs:items-center mcs:gap-1 mcs:text-sm mcs:text-muted-foreground mcs:group-enabled:group-hover:text-foreground'}>
                    {done.length} done {done.length > 0 && <NamedIcon name={'chevron-right'} size={14} />}
                </span>
            </button>
            <div className={'mcs:flex mcs:h-2 mcs:gap-0.5 mcs:overflow-hidden mcs:rounded-full mcs:bg-muted'}>
                {groups.map((group) => (
                    <span key={group.id} style={{ flexGrow: group.count, background: group.color }} title={`${group.label}: ${group.count}`} />
                ))}
            </div>
            {groups.length > 0 && (
                <ul className={'mcs:flex mcs:flex-wrap mcs:gap-x-3 mcs:gap-y-1 mcs:text-xs mcs:text-muted-foreground'}>
                    {groups.map((group) => (
                        <li key={group.id} className={'mcs:flex mcs:items-center mcs:gap-1.5'}>
                            <span className={'mcs:size-2 mcs:rounded-full'} style={{ background: group.color }} />
                            {group.label} {group.count}
                        </li>
                    ))}
                </ul>
            )}

            <Dialog open={open} onClose={() => setOpen(false)} title={`Advancements · ${done.length} done`}>
                <ul className={'mcs:-mx-1 mcs:flex mcs:max-h-[60vh] mcs:flex-col mcs:gap-2 mcs:overflow-y-auto mcs:px-1'}>
                    {done.map((item) => {
                        const { category, title } = split(item.id);
                        const tab = categoryOf(category);

                        return (
                            <li key={item.id} className={'mcs:flex mcs:items-center mcs:gap-3'}>
                                <span className={'mcs:flex mcs:size-8 mcs:shrink-0 mcs:items-center mcs:justify-center mcs:rounded mcs:bg-muted'} style={{ color: tab.color }}>
                                    <NamedIcon name={'trophy'} size={16} />
                                </span>
                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                    <p className={'mcs:truncate mcs:text-sm'}>{title}</p>
                                    <p className={'mcs:text-xs mcs:text-muted-foreground'}>{tab.label}</p>
                                </div>
                                {item.date && <span className={'mcs:shrink-0 mcs:text-xs mcs:text-muted-foreground'}>{formatDate(item.date, 'MMM D, YYYY')}</span>}
                            </li>
                        );
                    })}
                </ul>
            </Dialog>
        </section>
    );
}
