import type { KeyboardEvent } from 'react';
import { cn, fromNow } from '@pterodactyl/sdk';
import { compactNumber } from '../../api/client';
import type { ModHit } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, InstallButton, ItemIcon } from '../content/ui';
import SourceBadge from './SourceBadge';

/** Where the author says a mod runs. Client-only mods do nothing on a server. */
export function sidesLabel(sides: string[]): { label: string; icon: string; warn: boolean } | null {
    const server = sides.includes('Server');
    const client = sides.includes('Client');
    if (server && client) return { label: 'Client and server', icon: 'globe', warn: false };
    if (server) return { label: 'Server', icon: 'server', warn: false };
    if (client) return { label: 'Client only', icon: 'monitor', warn: true };

    return null;
}

interface Props {
    hit: ModHit;
    layout: 'list' | 'grid';
    busy?: boolean;
    onOpen: () => void;
    onInstall: () => void;
}

export default function ModCard({ hit, layout, busy = false, onOpen, onInstall }: Props) {
    const sides = sidesLabel(hit.sides);

    const stats = (
        <div className={cn('cks:flex cks:gap-x-4 cks:gap-y-1 cks:text-sm cks:text-muted-foreground', layout === 'list' ? 'cks:flex-col cks:items-end' : 'cks:flex-wrap cks:items-center')}>
            <span className={'cks:inline-flex cks:items-center cks:gap-1'} title={`${hit.downloads.toLocaleString()} ${hit.source === 'steam' ? 'subscribers' : 'downloads'}`}>
                <NamedIcon name={'download'} size={14} /> <strong className={'cks:text-foreground cks:font-semibold'}>{compactNumber(hit.downloads)}</strong>
            </span>
            {hit.updated > 0 && (
                <span className={'cks:inline-flex cks:items-center cks:gap-1'} title={'Last updated'}>
                    <NamedIcon name={'history'} size={14} /> {fromNow(new Date(hit.updated * 1000).toISOString())}
                </span>
            )}
        </div>
    );

    const action = <InstallButton installed={hit.installed === true} busy={busy} onClick={hit.installed ? onOpen : onInstall} />;

    return (
        <div
            role={'button'}
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event: KeyboardEvent) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onOpen();
                }
            }}
            className={
                'pt-surface cks:relative cks:flex cks:gap-4 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-4 cks:text-left cks:cursor-pointer cks:hover:border-primary cks:min-w-0 cks:overflow-hidden cks:focus-visible:outline-2 cks:focus-visible:outline-primary'
            }
        >
            <ItemIcon src={hit.icon} className={cn('cks:shrink-0', layout === 'list' ? 'cks:size-20' : 'cks:size-16')} />
            <div className={'cks:min-w-0 cks:flex-1 cks:flex cks:flex-col cks:gap-1.5'}>
                <div className={'cks:flex cks:flex-wrap cks:items-baseline cks:gap-x-2'}>
                    <span className={'cks:text-lg cks:font-bold cks:text-foreground cks:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'cks:text-sm cks:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'cks:text-sm cks:text-muted-foreground cks:line-clamp-2'}>{hit.summary}</p>
                <div className={'cks:flex cks:flex-wrap cks:gap-1.5'}>
                    <SourceBadge source={hit.source} />
                    {hit.alsoOn && <SourceBadge source={hit.alsoOn.source} className={'cks:opacity-80'} />}
                    {sides && (
                        <Chip tone={sides.warn ? 'warning' : undefined} title={sides.warn ? 'Tagged for players only: it may do nothing on a server.' : undefined}>
                            <NamedIcon name={sides.icon} size={12} /> {sides.label}
                        </Chip>
                    )}
                    {hit.categories.slice(0, 3).map((name) => (
                        <Chip key={name}>{name}</Chip>
                    ))}
                    {hit.gameVersions[0] && <Chip title={hit.gameVersions.join(', ')}>{hit.gameVersions[0]}</Chip>}
                </div>
                {layout === 'grid' && (
                    <div className={'cks:mt-auto cks:flex cks:flex-wrap cks:items-end cks:justify-between cks:gap-2 cks:pt-1'}>
                        {stats}
                        {action}
                    </div>
                )}
            </div>
            {layout === 'list' && (
                <div className={'cks:flex cks:shrink-0 cks:flex-col cks:items-end cks:justify-between cks:gap-3'}>
                    {stats}
                    {action}
                </div>
            )}
        </div>
    );
}
