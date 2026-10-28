import type { KeyboardEvent } from 'react';
import { cn, fromNow } from '@pterodactyl/sdk';
import { compactNumber } from '../../api/client';
import type { ModHit } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, InstallButton, ItemIcon } from '../content/ui';

interface Props {
    hit: ModHit;
    layout: 'list' | 'grid';
    busy?: boolean;
    /** The category's name, such as Utilities. */
    category?: string;
    onOpen: () => void;
    onInstall: () => void;
}

export default function ModCard({ hit, layout, busy = false, category, onOpen, onInstall }: Props) {

    const stats = (
        <div className={cn('sfy:flex sfy:gap-x-4 sfy:gap-y-1 sfy:text-sm sfy:text-muted-foreground', layout === 'list' ? 'sfy:flex-col sfy:items-end' : 'sfy:flex-wrap sfy:items-center')}>
            <span className={'sfy:inline-flex sfy:items-center sfy:gap-1'} title={`${hit.downloads.toLocaleString()} downloads`}>
                <NamedIcon name={'download'} size={14} /> <strong className={'sfy:text-foreground sfy:font-semibold'}>{compactNumber(hit.downloads)}</strong>
            </span>
            {hit.updated > 0 && (
                <span className={'sfy:inline-flex sfy:items-center sfy:gap-1'} title={'Last updated'}>
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
                'pt-surface sfy:relative sfy:flex sfy:gap-4 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card sfy:p-4 sfy:text-left sfy:cursor-pointer sfy:hover:border-primary sfy:min-w-0 sfy:overflow-hidden sfy:focus-visible:outline-2 sfy:focus-visible:outline-primary'
            }
        >
            <ItemIcon src={hit.icon} className={cn('sfy:shrink-0', layout === 'list' ? 'sfy:size-20' : 'sfy:size-16')} />
            <div className={'sfy:min-w-0 sfy:flex-1 sfy:flex sfy:flex-col sfy:gap-1.5'}>
                <div className={'sfy:flex sfy:flex-wrap sfy:items-baseline sfy:gap-x-2'}>
                    <span className={'sfy:text-lg sfy:font-bold sfy:text-foreground sfy:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'sfy:text-sm sfy:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'sfy:text-sm sfy:text-muted-foreground sfy:line-clamp-2'}>{hit.summary}</p>
                <div className={'sfy:flex sfy:flex-wrap sfy:gap-1.5'}>
                    {category && <Chip>{category}</Chip>}
                    {hit.version ? <Chip>{hit.version}</Chip> : <Chip tone={'warning'}>{hit.linux ? 'Not for this game build' : 'No server build'}</Chip>}
                </div>
                {layout === 'grid' && (
                    <div className={'sfy:mt-auto sfy:flex sfy:flex-wrap sfy:items-end sfy:justify-between sfy:gap-2 sfy:pt-1'}>
                        {stats}
                        {action}
                    </div>
                )}
            </div>
            {layout === 'list' && (
                <div className={'sfy:flex sfy:shrink-0 sfy:flex-col sfy:items-end sfy:justify-between sfy:gap-3'}>
                    {stats}
                    {action}
                </div>
            )}
        </div>
    );
}
