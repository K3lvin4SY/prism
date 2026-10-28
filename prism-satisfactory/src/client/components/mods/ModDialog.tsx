import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Dialog, Spinner, fromNow, httpErrorToHuman } from '@pterodactyl/sdk';
import { compactNumber } from '../../api/client';
import { getMod, modKeys, type ModHit } from '../../api/mods';
import { NamedIcon } from '../../icons';
import { Chip, ItemIcon } from '../content/ui';

interface Props {
    identifier: string;
    hit: ModHit;
    running: boolean;
    busy: boolean;
    onInstall: (id: string, restart: boolean) => void;
    onClose: () => void;
}

/** A mod's page: description, the release this server gets, and what it needs. */
export default function ModDialog({ identifier, hit, running, busy, onInstall, onClose }: Props) {
    const [restart, setRestart] = useState(true);
    const details = useQuery({ queryKey: modKeys.item(identifier, hit.id), queryFn: () => getMod(identifier, hit.id), staleTime: 300_000 });
    const mod = details.data?.mod;
    const missing = details.data?.dependencies.filter((dependency) => !dependency.installed) ?? [];
    const problems = details.data?.problems ?? [];

    return (
        <Dialog open onClose={onClose} title={hit.title}>
            <div className={'sfy:flex sfy:flex-col sfy:gap-4 sfy:max-h-[70vh] sfy:overflow-y-auto sfy:pr-1'}>
                <div className={'sfy:flex sfy:gap-4'}>
                    <ItemIcon src={mod?.icon ?? hit.icon} className={'sfy:size-20 sfy:shrink-0'} />
                    <div className={'sfy:flex sfy:min-w-0 sfy:flex-col sfy:gap-1.5'}>
                        {hit.author && <span className={'sfy:text-sm sfy:text-muted-foreground'}>by {hit.author}</span>}
                        <div className={'sfy:flex sfy:flex-wrap sfy:gap-1.5'}>
                            {hit.tags.slice(0, 6).map((tag) => (
                                <Chip key={tag}>{tag}</Chip>
                            ))}
                        </div>
                        <div className={'sfy:flex sfy:flex-wrap sfy:gap-x-4 sfy:text-sm sfy:text-muted-foreground'}>
                            <span>{compactNumber(hit.downloads)} downloads</span>
                            {mod?.version && <span>Version {mod.version}</span>}
                            {mod?.latest && mod.latest !== mod.version && <span>Newest {mod.latest}</span>}
                            {(mod?.updated ?? hit.updated) > 0 && <span>Updated {fromNow(new Date((mod?.updated ?? hit.updated) * 1000).toISOString())}</span>}
                        </div>
                        <a href={hit.url} target={'_blank'} rel={'noreferrer'} className={'sfy:inline-flex sfy:items-center sfy:gap-1 sfy:text-sm sfy:text-primary sfy:hover:underline'}>
                            Open on ficsit.app <NamedIcon name={'external-link'} size={12} />
                        </a>
                    </div>
                </div>

                {details.isLoading && <Spinner centered />}
                {details.isError && <Alert type={'danger'}>{httpErrorToHuman(details.error)}</Alert>}

                {problems.map((problem) => (
                    <Alert key={problem} type={'warning'}>
                        {problem}
                    </Alert>
                ))}

                {missing.length > 0 && (
                    <div className={'sfy:flex sfy:flex-col sfy:gap-2'}>
                        <h3 className={'sfy:text-sm sfy:font-semibold'}>Also installs what it needs</h3>
                        {missing.map((dependency) => (
                            <div key={dependency.id} className={'sfy:flex sfy:items-center sfy:gap-2 sfy:text-sm'}>
                                <ItemIcon src={dependency.icon} className={'sfy:size-8 sfy:shrink-0'} />
                                <span className={'sfy:flex-1 sfy:truncate'}>{dependency.title}</span>
                            </div>
                        ))}
                    </div>
                )}

                {mod?.body ? (
                    <p className={'sfy:whitespace-pre-line sfy:text-sm sfy:text-muted-foreground'}>{mod.body}</p>
                ) : (
                    <p className={'sfy:text-sm sfy:text-muted-foreground'}>{hit.summary}</p>
                )}
            </div>

            <Dialog.Footer>
                {running && (
                    <label className={'sfy:mr-auto sfy:flex sfy:items-center sfy:gap-2 sfy:text-sm'}>
                        <Checkbox checked={restart} onChange={setRestart} /> Restart the server to load it
                    </label>
                )}
                <Button.Text onClick={onClose}>Close</Button.Text>
                <Button isLoading={busy} disabled={!mod || problems.length > 0} onClick={() => onInstall(hit.id, running && restart)}>
                    {mod?.installed ? 'Reinstall' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
