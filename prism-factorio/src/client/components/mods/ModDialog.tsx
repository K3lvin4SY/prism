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
    /** The category's name. */
    category?: string;
    /** The expansion's mods the server has. */
    expansion: string[];
    running: boolean;
    busy: boolean;
    onInstall: (id: string, restart: boolean) => void;
    onClose: () => void;
}

/** A mod's page: description, the release this server gets, and what it needs. */
export default function ModDialog({ identifier, hit, category, expansion, running, busy, onInstall, onClose }: Props) {
    const [restart, setRestart] = useState(true);
    const details = useQuery({ queryKey: modKeys.item(identifier, hit.id), queryFn: () => getMod(identifier, hit.id), staleTime: 300_000 });
    const mod = details.data?.mod;
    const missing = details.data?.dependencies.filter((dependency) => !dependency.installed) ?? [];
    const noRelease = mod !== undefined && mod.version === null;

    return (
        <Dialog open onClose={onClose} title={hit.title}>
            <div className={'fct:flex fct:flex-col fct:gap-4 fct:max-h-[70vh] fct:overflow-y-auto fct:pr-1'}>
                <div className={'fct:flex fct:gap-4'}>
                    <ItemIcon src={mod?.icon ?? hit.icon} className={'fct:size-20 fct:shrink-0'} />
                    <div className={'fct:flex fct:min-w-0 fct:flex-col fct:gap-1.5'}>
                        {hit.author && <span className={'fct:text-sm fct:text-muted-foreground'}>by {hit.author}</span>}
                        <div className={'fct:flex fct:flex-wrap fct:gap-1.5'}>
                            {category && <Chip>{category}</Chip>}
                            {mod?.expansion && (
                                <Chip tone={expansion.includes('space-age') ? undefined : 'warning'}>
                                    <NamedIcon name={'rocket'} size={12} /> Needs Space Age
                                </Chip>
                            )}
                        </div>
                        <div className={'fct:flex fct:flex-wrap fct:gap-x-4 fct:text-sm fct:text-muted-foreground'}>
                            <span>{compactNumber(hit.downloads)} downloads</span>
                            {mod?.version && <span>Version {mod.version}</span>}
                            {mod?.factorioVersion && <span>For Factorio {mod.factorioVersion}</span>}
                            {(mod?.updated ?? hit.updated) > 0 && <span>Updated {fromNow(new Date((mod?.updated ?? hit.updated) * 1000).toISOString())}</span>}
                        </div>
                        <a href={hit.url} target={'_blank'} rel={'noreferrer'} className={'fct:inline-flex fct:items-center fct:gap-1 fct:text-sm fct:text-primary fct:hover:underline'}>
                            Open on the mod portal <NamedIcon name={'external-link'} size={12} />
                        </a>
                    </div>
                </div>

                {details.isLoading && <Spinner centered />}
                {details.isError && <Alert type={'danger'}>{httpErrorToHuman(details.error)}</Alert>}

                {noRelease && (
                    <Alert type={'warning'}>
                        No release for Factorio {details.data?.factorioVersion} yet. It has releases for {mod.versions.join(', ') || 'no version'}.
                    </Alert>
                )}
                {mod?.expansion && !expansion.includes('space-age') && <Alert type={'warning'}>This release needs the Space Age expansion, which this server does not have.</Alert>}
                {details.data && details.data.conflicts.length > 0 && <Alert type={'warning'}>It does not work together with {details.data.conflicts.join(', ')}, which this server has.</Alert>}

                {missing.length > 0 && (
                    <div className={'fct:flex fct:flex-col fct:gap-2'}>
                        <h3 className={'fct:text-sm fct:font-semibold'}>Also installs what it needs</h3>
                        {missing.map((dependency) => (
                            <div key={dependency.id} className={'fct:flex fct:items-center fct:gap-2 fct:text-sm'}>
                                <ItemIcon src={dependency.icon} className={'fct:size-8 fct:shrink-0'} />
                                <span className={'fct:flex-1 fct:truncate'}>{dependency.title}</span>
                            </div>
                        ))}
                    </div>
                )}

                {mod?.body ? (
                    <p className={'fct:whitespace-pre-line fct:text-sm fct:text-muted-foreground'}>{mod.body}</p>
                ) : (
                    <p className={'fct:text-sm fct:text-muted-foreground'}>{hit.summary}</p>
                )}
            </div>

            <Dialog.Footer>
                {running && (
                    <label className={'fct:mr-auto fct:flex fct:items-center fct:gap-2 fct:text-sm'}>
                        <Checkbox checked={restart} onChange={setRestart} /> Restart the server to load it
                    </label>
                )}
                <Button.Text onClick={onClose}>Close</Button.Text>
                <Button isLoading={busy} disabled={!mod || noRelease} onClick={() => onInstall(hit.id, running && restart)}>
                    {mod?.installed ? 'Reinstall' : 'Install'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
