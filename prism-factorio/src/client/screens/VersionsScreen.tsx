import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Dialog, ServerContentBlock, Spinner, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getVersions, installVersion, type VersionsOverview } from '../api/versions';
import { compareVersions, groupByMajor, major, resolve } from '../lib/versions';
import JobProgress from '../components/JobProgress';
import { useFactorioInfo } from '../hooks/useFactorioInfo';
import { NamedIcon } from '../icons';

export default function VersionsScreen() {
    const { identifier } = useFactorioInfo();
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: keys.versions(identifier), queryFn: () => getVersions(identifier) });
    const [job, setJob] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);

    const finished = useCallback(
        (status: 'completed' | 'failed') => {
            void queryClient.invalidateQueries({ queryKey: ['prism-factorio', identifier] });
            if (status === 'completed') toast.success('Done. The new version is installed.');
        },
        [queryClient, identifier]
    );

    if (overview.isLoading) {
        return (
            <ServerContentBlock title={'Versions'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (overview.isError || !overview.data) {
        return (
            <ServerContentBlock title={'Versions'}>
                <Alert type={'danger'}>{httpErrorToHuman(overview.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const data = overview.data;
    const activeJob = job ?? data.job;
    const groups = groupByMajor(data.versions);
    const following = data.chosen === 'latest' ? 'the newest stable version' : data.chosen === 'experimental' ? 'the newest experimental version' : `version ${data.chosen}`;

    return (
        <ServerContentBlock title={'Versions'}>
            <div className={'fct:flex fct:flex-col fct:gap-4'}>
                {activeJob && <JobProgress key={activeJob} job={activeJob} onFinished={finished} />}

                <div className={'pt-surface fct:flex fct:flex-wrap fct:items-center fct:gap-4 fct:rounded-md fct:border fct:border-border fct:bg-card fct:p-4'}>
                    <span className={'fct:flex fct:size-12 fct:items-center fct:justify-center fct:rounded-lg fct:bg-primary/15 fct:text-primary'}>
                        <NamedIcon name={'settings'} size={22} />
                    </span>
                    <div className={'fct:min-w-0 fct:flex-1'}>
                        <p className={'fct:text-lg fct:font-semibold'}>Factorio {data.installed ?? '(not installed yet)'}</p>
                        <p className={'fct:text-xs fct:text-muted-foreground'}>A reinstall installs {following}.</p>
                    </div>
                    {data.update && data.stable && (
                        <Button onClick={() => setSelected('latest')}>
                            <NamedIcon name={'arrow-up'} size={16} className={'fct:mr-1'} /> Update to {data.stable}
                        </Button>
                    )}
                </div>

                <div className={'fct:grid fct:gap-2 fct:sm:grid-cols-2'}>
                    <Choice
                        title={'Latest stable'}
                        detail={data.stable ? `${data.stable} · keeps to the newest stable version on each reinstall` : 'Not known right now'}
                        badge={'Stable'}
                        current={data.chosen === 'latest'}
                        onClick={() => setSelected('latest')}
                    />
                    <Choice
                        title={'Latest experimental'}
                        detail={data.experimental ? `${data.experimental} · newest features, may have bugs` : 'Not known right now'}
                        badge={'Experimental'}
                        current={data.chosen === 'experimental'}
                        onClick={() => setSelected('experimental')}
                    />
                </div>

                <div className={'fct:flex fct:flex-col fct:gap-2'}>
                    <h3 className={'fct:text-sm fct:font-semibold'}>A fixed version</h3>
                    {groups.map((group) => {
                        const expanded = open === group.major || group.versions.includes(data.installed ?? '');
                        const shown = expanded ? group.versions : group.versions.slice(0, 1);

                        return (
                            <div key={group.major} className={'pt-surface fct:flex fct:flex-col fct:gap-2 fct:rounded-md fct:border fct:border-border fct:bg-card fct:p-3'}>
                                <div className={'fct:flex fct:items-center fct:gap-2'}>
                                    <span className={'fct:font-semibold'}>Factorio {group.major}</span>
                                    <span className={'fct:text-xs fct:text-muted-foreground'}>{group.versions.length === 1 ? '1 version' : `${group.versions.length} versions`}</span>
                                    {!expanded && group.versions.length > 1 && (
                                        <Button.Text size={'small'} className={'fct:ml-auto'} onClick={() => setOpen(group.major)}>
                                            Show all
                                        </Button.Text>
                                    )}
                                </div>
                                <div className={'fct:flex fct:flex-wrap fct:gap-1.5'}>
                                    {shown.map((version) => (
                                        <button
                                            key={version}
                                            type={'button'}
                                            onClick={() => setSelected(version)}
                                            className={cn(
                                                'fct:inline-flex fct:items-center fct:gap-1 fct:rounded-md fct:border fct:px-2.5 fct:py-1 fct:font-mono fct:text-sm fct:cursor-pointer fct:hover:border-primary',
                                                version === data.installed ? 'fct:border-primary fct:bg-primary/10' : 'fct:border-border'
                                            )}
                                        >
                                            {version}
                                            {version === data.installed && <NamedIcon name={'check'} size={12} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className={'fct:text-xs fct:text-muted-foreground'}>Players need the same version as the server. Changing it reinstalls the server with the egg, which keeps the settings, saves and mods.</p>
            </div>

            {selected && (
                <InstallDialog
                    identifier={identifier}
                    overview={data}
                    choice={selected}
                    onClose={() => setSelected(null)}
                    onStarted={(started) => {
                        setSelected(null);
                        setJob(started);
                    }}
                />
            )}
        </ServerContentBlock>
    );
}

function Choice({ title, detail, badge, current, onClick }: { title: string; detail: string; badge: string; current: boolean; onClick: () => void }) {
    return (
        <button
            type={'button'}
            onClick={onClick}
            className={cn('pt-surface fct:flex fct:flex-col fct:gap-1 fct:rounded-md fct:border fct:bg-card fct:p-3 fct:text-left fct:cursor-pointer fct:hover:border-primary', current ? 'fct:border-primary' : 'fct:border-border')}
        >
            <div className={'fct:flex fct:flex-wrap fct:items-center fct:gap-2'}>
                <span className={'fct:font-semibold'}>{title}</span>
                <Badge size={'sm'} tone={badge === 'Stable' ? 'success' : 'warning'}>
                    {badge}
                </Badge>
                {current && (
                    <Badge size={'sm'} tone={'info'}>
                        Chosen
                    </Badge>
                )}
            </div>
            <span className={'fct:text-xs fct:text-muted-foreground'}>{detail}</span>
        </button>
    );
}

function InstallDialog({ identifier, overview, choice, onClose, onStarted }: { identifier: string; overview: VersionsOverview; choice: string; onClose: () => void; onStarted: (job: string) => void }) {
    const target = resolve(choice, overview);
    const older = target !== null && overview.installed !== null && compareVersions(target, overview.installed) < 0;
    const newMajor = target !== null && overview.installed !== null && major(target) !== major(overview.installed);
    const [backup, setBackup] = useState(older || newMajor);
    const [start, setStart] = useState(false);
    const [busy, setBusy] = useState(false);

    const go = async () => {
        setBusy(true);
        try {
            onStarted(await installVersion(identifier, choice, { backup, start }));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`Install Factorio ${target ?? choice}?`}>
            <div className={'fct:flex fct:flex-col fct:gap-3 fct:text-sm'}>
                <p>The server stops and is reinstalled with this version. That takes a minute or two; the console shows how it goes.</p>
                {choice === 'latest' && <p className={'fct:text-muted-foreground'}>Later reinstalls keep to the newest stable version.</p>}
                {choice === 'experimental' && <p className={'fct:text-muted-foreground'}>Later reinstalls keep to the newest experimental version.</p>}
                {older && <Alert type={'warning'}>A map saved by a newer version does not open in an older one. Keep a backup of the saves.</Alert>}
                {newMajor && overview.mods.length > 0 && (
                    <Alert type={'warning'}>
                        Mods are made for one game version. {overview.mods.length === 1 ? `${overview.mods[0].title} may` : `${overview.mods.length} mods may`} need an update for {major(target!)}, from the Mods tab, or the server may not start.
                    </Alert>
                )}
                <label className={'fct:flex fct:items-center fct:gap-2'}>
                    <Checkbox checked={backup} onChange={setBackup} /> Back up the saves first
                </label>
                {!overview.running && (
                    <label className={'fct:flex fct:items-center fct:gap-2'}>
                        <Checkbox checked={start} onChange={setStart} /> Start the server when it is done
                    </label>
                )}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} onClick={() => void go()}>
                    Install
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
