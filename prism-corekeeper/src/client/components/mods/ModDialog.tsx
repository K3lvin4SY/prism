import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Spinner, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { bytes, compactNumber } from '../../api/client';
import { SOURCE_NAMES, getMod, modKeys, type ModHit } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, ItemIcon } from '../content/ui';
import { sidesLabel } from './ModCard';
import SourceBadge from './SourceBadge';

interface Props {
    identifier: string;
    hit: ModHit;
    running: boolean;
    busy: boolean;
    onInstall: (id: string, restart: boolean) => void;
    onClose: () => void;
}

/** A mod's page: description, pictures, what it needs, and where to install it from. */
export default function ModDialog({ identifier, hit, running, busy, onInstall, onClose }: Props) {
    // A mod on both sources can be installed from either; mod.io is quicker as it needs no restart to download.
    const [from, setFrom] = useState(hit.alsoOn?.source === 'modio' ? hit.alsoOn.id : hit.id);
    const [restart, setRestart] = useState(true);
    const details = useQuery({ queryKey: modKeys.item(identifier, from), queryFn: () => getMod(identifier, from), staleTime: 300_000 });
    const mod = details.data?.mod ?? (from === hit.id ? hit : null);
    const sides = mod ? sidesLabel(mod.sides) : null;
    const missing = details.data?.dependencies.filter((dependency) => !dependency.installed) ?? [];

    return (
        <Dialog open onClose={onClose} title={hit.title}>
            <div className={'cks:flex cks:flex-col cks:gap-4 cks:max-h-[70vh] cks:overflow-y-auto cks:pr-1'}>
                <div className={'cks:flex cks:gap-4'}>
                    <ItemIcon src={mod?.icon ?? hit.icon} className={'cks:size-20 cks:shrink-0'} />
                    <div className={'cks:flex cks:min-w-0 cks:flex-col cks:gap-1.5'}>
                        {mod?.author && <span className={'cks:text-sm cks:text-muted-foreground'}>by {mod.author}</span>}
                        <div className={'cks:flex cks:flex-wrap cks:gap-1.5'}>
                            {mod && <SourceBadge source={mod.source} />}
                            {sides && (
                                <Chip tone={sides.warn ? 'warning' : undefined}>
                                    <NamedIcon name={sides.icon} size={12} /> {sides.label}
                                </Chip>
                            )}
                            {mod?.categories.map((name) => <Chip key={name}>{name}</Chip>)}
                        </div>
                        <div className={'cks:flex cks:flex-wrap cks:gap-x-4 cks:text-sm cks:text-muted-foreground'}>
                            {mod && <span>{compactNumber(mod.downloads)} {mod.source === 'steam' ? 'subscribers' : 'downloads'}</span>}
                            {mod?.version && <span>Version {mod.version}</span>}
                            {mod && mod.size > 0 && <span>{bytes(mod.size)}</span>}
                            {mod && mod.updated > 0 && <span>Updated {fromNow(new Date(mod.updated * 1000).toISOString())}</span>}
                        </div>
                        {mod && (
                            <a href={mod.url} target={'_blank'} rel={'noreferrer'} className={'cks:inline-flex cks:items-center cks:gap-1 cks:text-sm cks:text-primary cks:hover:underline'}>
                                Open on {SOURCE_NAMES[mod.source]} <NamedIcon name={'external-link'} size={12} />
                            </a>
                        )}
                    </div>
                </div>

                {hit.alsoOn && (
                    <div className={'pt-surface cks:flex cks:flex-wrap cks:items-center cks:gap-2 cks:rounded-lg cks:border cks:border-border cks:bg-muted/30 cks:p-3 cks:text-sm'}>
                        <span className={'cks:flex-1'}>On both mod.io and the Steam Workshop. Install from:</span>
                        {[hit.id, hit.alsoOn.id].map((id) => (
                            <button
                                key={id}
                                type={'button'}
                                onClick={() => setFrom(id)}
                                className={`cks:rounded-md cks:px-3 cks:py-1 cks:cursor-pointer ${from === id ? 'cks:bg-primary cks:text-primary-foreground' : 'cks:bg-card cks:border cks:border-border cks:hover:bg-muted'}`}
                            >
                                {SOURCE_NAMES[id.startsWith('modio:') ? 'modio' : 'steam']}
                            </button>
                        ))}
                    </div>
                )}

                {details.isLoading && <Spinner centered />}
                {details.isError && <Alert type={'danger'}>{httpErrorToHuman(details.error)}</Alert>}

                {from.startsWith('steam:') && (
                    <Alert type={'info'}>
                        Steam Workshop files are downloaded by the server when it starts, so this mod arrives after a restart. Steam may refuse without a Steam login in Prism Properties.
                    </Alert>
                )}

                {missing.length > 0 && (
                    <div className={'cks:flex cks:flex-col cks:gap-2'}>
                        <h3 className={'cks:text-sm cks:font-semibold'}>Also installs what it needs</h3>
                        {missing.map((dependency) => (
                            <div key={dependency.id} className={'cks:flex cks:items-center cks:gap-2 cks:text-sm'}>
                                <ItemIcon src={dependency.icon} className={'cks:size-8 cks:shrink-0'} />
                                <span className={'cks:flex-1 cks:truncate'}>{dependency.title}</span>
                                <SourceBadge source={dependency.source} />
                            </div>
                        ))}
                    </div>
                )}

                {mod?.screenshots && mod.screenshots.length > 0 && (
                    <div className={'cks:flex cks:gap-2 cks:overflow-x-auto cks:pb-1'}>
                        {mod.screenshots.slice(0, 8).map((src) => (
                            <img key={src} src={src} alt={''} loading={'lazy'} className={'cks:h-32 cks:rounded-md cks:object-cover'} />
                        ))}
                    </div>
                )}

                {mod?.body && <p className={'cks:whitespace-pre-line cks:text-sm cks:text-muted-foreground'}>{mod.body}</p>}
            </div>

            <Dialog.Footer>
                {running && (
                    <label className={'cks:mr-auto cks:flex cks:items-center cks:gap-2 cks:text-sm'}>
                        <Checkbox checked={restart} onChange={setRestart} /> Restart the server to load it
                    </label>
                )}
                <Button.Text onClick={onClose}>Close</Button.Text>
                <Button isLoading={busy} disabled={!mod || details.isLoading} onClick={() => onInstall(from, running && restart)}>
                    {details.data?.mod.installed ? 'Reinstall' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
