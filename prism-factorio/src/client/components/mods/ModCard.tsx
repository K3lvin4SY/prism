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
        <div className={cn('fct:flex fct:gap-x-4 fct:gap-y-1 fct:text-sm fct:text-muted-foreground', layout === 'list' ? 'fct:flex-col fct:items-end' : 'fct:flex-wrap fct:items-center')}>
            <span className={'fct:inline-flex fct:items-center fct:gap-1'} title={`${hit.downloads.toLocaleString()} downloads`}>
                <NamedIcon name={'download'} size={14} /> <strong className={'fct:text-foreground fct:font-semibold'}>{compactNumber(hit.downloads)}</strong>
            </span>
            {hit.updated > 0 && (
                <span className={'fct:inline-flex fct:items-center fct:gap-1'} title={'Last updated'}>
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
                'pt-surface fct:relative fct:flex fct:gap-4 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:p-4 fct:text-left fct:cursor-pointer fct:hover:border-primary fct:min-w-0 fct:overflow-hidden fct:focus-visible:outline-2 fct:focus-visible:outline-primary'
            }
        >
            <ItemIcon src={hit.icon} className={cn('fct:shrink-0', layout === 'list' ? 'fct:size-20' : 'fct:size-16')} />
            <div className={'fct:min-w-0 fct:flex-1 fct:flex fct:flex-col fct:gap-1.5'}>
                <div className={'fct:flex fct:flex-wrap fct:items-baseline fct:gap-x-2'}>
                    <span className={'fct:text-lg fct:font-bold fct:text-foreground fct:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'fct:text-sm fct:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'fct:text-sm fct:text-muted-foreground fct:line-clamp-2'}>{hit.summary}</p>
                <div className={'fct:flex fct:flex-wrap fct:gap-1.5'}>
                    {category && <Chip>{category}</Chip>}
                    {hit.version && <Chip title={hit.factorioVersion ? `For Factorio ${hit.factorioVersion}` : undefined}>{hit.version}</Chip>}
                </div>
                {layout === 'grid' && (
                    <div className={'fct:mt-auto fct:flex fct:flex-wrap fct:items-end fct:justify-between fct:gap-2 fct:pt-1'}>
                        {stats}
                        {action}
                    </div>
                )}
            </div>
            {layout === 'list' && (
                <div className={'fct:flex fct:shrink-0 fct:flex-col fct:items-end fct:justify-between fct:gap-3'}>
                    {stats}
                    {action}
                </div>
            )}
        </div>
    );
}
