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

    // Phones get one short line of stats beside a smaller button instead of the chips and stats column.
    const warning = null;
    const phoneRow = (
        <div className={'fct:flex fct:items-center fct:justify-between fct:gap-2 fct:sm:hidden'}>
            <div className={'fct:flex fct:min-w-0 fct:items-center fct:gap-3 fct:text-xs fct:text-muted-foreground'}>
                <span className={'fct:inline-flex fct:items-center fct:gap-1'}>
                    <NamedIcon name={'download'} size={12} /> <strong className={'fct:text-foreground fct:font-semibold'}>{compactNumber(hit.downloads)}</strong>
                </span>
                {warning ? (
                    <span className={'fct:truncate fct:text-warning'}>{warning}</span>
                ) : (
                    hit.updated > 0 && (
                        <span className={'fct:inline-flex fct:min-w-0 fct:items-center fct:gap-1'}>
                            <NamedIcon name={'history'} size={12} /> <span className={'fct:truncate'}>{fromNow(new Date(hit.updated * 1000).toISOString())}</span>
                        </span>
                    )
                )}
            </div>
            <InstallButton installed={hit.installed === true} busy={busy} compact onClick={hit.installed ? onOpen : onInstall} />
        </div>
    );

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
                'pt-surface fct:relative fct:flex fct:gap-3 fct:sm:gap-4 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:p-3 fct:sm:p-4 fct:text-left fct:cursor-pointer fct:hover:border-primary fct:min-w-0 fct:overflow-hidden fct:focus-visible:outline-2 fct:focus-visible:outline-primary'
            }
        >
            <ItemIcon src={hit.icon} className={cn('fct:shrink-0 fct:size-12', layout === 'list' ? 'fct:sm:size-20' : 'fct:sm:size-16')} />
            <div className={'fct:min-w-0 fct:flex-1 fct:flex fct:flex-col fct:gap-1 fct:sm:gap-1.5'}>
                <div className={'fct:flex fct:min-w-0 fct:items-baseline fct:gap-x-2 fct:sm:flex-wrap'}>
                    <span className={'fct:min-w-0 fct:text-base fct:sm:text-lg fct:font-bold fct:text-foreground fct:truncate'}>{hit.title}</span>
                    {hit.author && <span className={'fct:hidden fct:sm:inline fct:text-sm fct:text-muted-foreground'}>by {hit.author}</span>}
                </div>
                <p className={'fct:text-xs fct:sm:text-sm fct:text-muted-foreground fct:line-clamp-2'}>{hit.summary}</p>
                {phoneRow}
                <div className={'fct:hidden fct:sm:flex fct:flex-wrap fct:gap-1.5'}>
                    {category && <Chip>{category}</Chip>}
                    {hit.version && <Chip title={hit.factorioVersion ? `For Factorio ${hit.factorioVersion}` : undefined}>{hit.version}</Chip>}
                </div>
                {layout === 'grid' && (
                    <div className={'fct:mt-auto fct:hidden fct:sm:flex fct:flex-wrap fct:items-end fct:justify-between fct:gap-2 fct:pt-1'}>
                        {stats}
                        {action}
                    </div>
                )}
            </div>
            {layout === 'list' && (
                <div className={'fct:hidden fct:sm:flex fct:shrink-0 fct:flex-col fct:items-end fct:justify-between fct:gap-3'}>
                    {stats}
                    {action}
                </div>
            )}
        </div>
    );
}
