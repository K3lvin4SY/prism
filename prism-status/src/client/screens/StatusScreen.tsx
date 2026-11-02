import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, PageContentBlock, Spinner, formatDate, fromNow, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { IMPACTS, STATES, STATUSES } from '../../status/lib';
import { componentsKey, getComponents, getIncidents, incidentsKey, orderComponents, removeComponent, removeIncident, type AdminComponent, type AdminIncident, type State } from '../api';
import ComponentDialog from '../components/ComponentDialog';
import IncidentDialog from '../components/IncidentDialog';
import { configStore } from '../config';
import { NamedIcon } from '../icons';

const TONES: Record<State, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { up: 'success', degraded: 'warning', down: 'danger', maintenance: 'info', unknown: 'neutral' };

const card = 'pt-surface pst:overflow-hidden pst:rounded-xl pst:border pst:border-border pst:bg-card';
const head = 'pst:flex pst:flex-wrap pst:items-center pst:gap-3 pst:border-b pst:border-border pst:px-5 pst:py-4';

/** The admin area's "Status page": what /status shows and the incidents posted on it. */
export default function StatusScreen() {
    const config = configStore.use();
    const client = useQueryClient();
    const components = useQuery({ queryKey: componentsKey, queryFn: getComponents, refetchInterval: 60_000 });
    const incidents = useQuery({ queryKey: incidentsKey, queryFn: getIncidents });
    const [editing, setEditing] = useState<AdminComponent | 'new' | null>(null);
    const [posting, setPosting] = useState<AdminIncident | 'new' | null>(null);
    const [removing, setRemoving] = useState<{ kind: 'component'; item: AdminComponent } | { kind: 'incident'; item: AdminIncident } | null>(null);
    const [busy, setBusy] = useState(false);

    const list = components.data ?? [];
    const groups = [...new Set(list.map((item) => item.group).filter(Boolean))];
    const refresh = () => Promise.all([client.invalidateQueries({ queryKey: componentsKey }), client.invalidateQueries({ queryKey: incidentsKey })]);

    const move = async (index: number, by: -1 | 1) => {
        const ids = list.map((item) => item.id);
        [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
        try {
            await orderComponents(ids);
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    return (
        <PageContentBlock title={'Status page'}>
            <div className={'pst:mx-auto pst:flex pst:max-w-5xl pst:flex-col pst:gap-4'}>
                {!config.enabled && <Alert type={'warning'}>The status page is off in Prism Properties, so /status shows nothing and nothing is checked. You can still prepare it here.</Alert>}

                <section className={card}>
                    <header className={head}>
                        <div className={'pst:min-w-0 pst:flex-1'}>
                            <h2 className={'pst:font-header pst:text-lg pst:font-semibold'}>On the page</h2>
                            <p className={'pst:text-sm pst:text-muted-foreground'}>Each is checked once a minute and gets a bar per day of history. {config.requireSignIn ? 'Only signed-in people can see the page.' : 'Anyone with the address can see the page.'}</p>
                        </div>
                        <a href={'/status'} target={'_blank'} rel={'noreferrer'}>
                            <Button.Text size={'small'} tabIndex={-1}>
                                <NamedIcon name={'external-link'} size={14} className={'pst:mr-1'} /> Open /status
                            </Button.Text>
                        </a>
                        <Button onClick={() => setEditing('new')}>
                            <NamedIcon name={'plus'} size={16} className={'pst:mr-1'} /> Add
                        </Button>
                    </header>
                    {components.isLoading && (
                        <div className={'pst:flex pst:justify-center pst:py-10'}>
                            <Spinner />
                        </div>
                    )}
                    {components.isError && (
                        <div className={'pst:p-5'}>
                            <Alert type={'danger'}>{httpErrorToHuman(components.error)}</Alert>
                        </div>
                    )}
                    {components.data?.length === 0 && <p className={'pst:py-12 pst:text-center pst:text-sm pst:text-muted-foreground'}>Nothing on the page yet. Add the nodes and servers people should see.</p>}
                    {list.map((component, index) => (
                        <div key={component.id} className={'pst:flex pst:flex-wrap pst:items-center pst:gap-3 pst:border-b pst:border-border pst:px-5 pst:py-3 pst:last:border-b-0'}>
                            <div className={'pst:flex pst:flex-col'}>
                                <button type={'button'} aria-label={'Move up'} disabled={index === 0} className={'pst:text-muted-foreground pst:hover:text-foreground pst:disabled:invisible'} onClick={() => void move(index, -1)}>
                                    <NamedIcon name={'chevron-up'} size={14} />
                                </button>
                                <button type={'button'} aria-label={'Move down'} disabled={index === list.length - 1} className={'pst:text-muted-foreground pst:hover:text-foreground pst:disabled:invisible'} onClick={() => void move(index, 1)}>
                                    <NamedIcon name={'chevron-down'} size={14} />
                                </button>
                            </div>
                            <NamedIcon name={component.type === 'node' ? 'server' : 'box'} size={16} className={'pst:text-muted-foreground'} />
                            <div className={'pst:min-w-0 pst:flex-1'}>
                                <p className={'pst:truncate pst:font-semibold'}>
                                    {component.label}
                                    {component.group && <span className={'pst:ml-2 pst:text-xs pst:font-normal pst:text-muted-foreground'}>{component.group}</span>}
                                </p>
                                <p className={'pst:truncate pst:text-xs pst:text-muted-foreground'}>
                                    {component.source ? `${component.type === 'node' ? 'Node' : 'Server'} ${component.source}` : `The ${component.type} was deleted`}
                                    {component.checked_at && ` · checked ${fromNow(component.checked_at)}`}
                                </p>
                            </div>
                            <Badge size={'sm'} variant={'soft'} tone={TONES[component.state]}>
                                {STATES[component.state]}
                            </Badge>
                            <Button.Text size={'small'} onClick={() => setEditing(component)}>
                                Change
                            </Button.Text>
                            <Button.Danger size={'small'} isSecondary onClick={() => setRemoving({ kind: 'component', item: component })}>
                                Remove
                            </Button.Danger>
                        </div>
                    ))}
                </section>

                <section className={card}>
                    <header className={head}>
                        <div className={'pst:min-w-0 pst:flex-1'}>
                            <h2 className={'pst:font-header pst:text-lg pst:font-semibold'}>Incidents</h2>
                            <p className={'pst:text-sm pst:text-muted-foreground'}>Tell people what is going on. Resolved incidents stay on the page for two weeks.</p>
                        </div>
                        <Button onClick={() => setPosting('new')}>
                            <NamedIcon name={'plus'} size={16} className={'pst:mr-1'} /> New incident
                        </Button>
                    </header>
                    {incidents.isError && (
                        <div className={'pst:p-5'}>
                            <Alert type={'danger'}>{httpErrorToHuman(incidents.error)}</Alert>
                        </div>
                    )}
                    {incidents.data?.data.length === 0 && <p className={'pst:py-12 pst:text-center pst:text-sm pst:text-muted-foreground'}>No incidents. Good.</p>}
                    {incidents.data?.data.map((incident) => (
                        <article key={incident.id} className={'pst:flex pst:flex-col pst:gap-2 pst:border-b pst:border-border pst:px-5 pst:py-3.5 pst:last:border-b-0 ' + (incident.resolved_at ? 'pst:opacity-70' : '')}>
                            <div className={'pst:flex pst:flex-wrap pst:items-center pst:gap-2'}>
                                <p className={'pst:min-w-0 pst:flex-1 pst:font-semibold'}>{incident.title}</p>
                                <Badge size={'sm'} variant={'soft'} tone={incident.resolved_at ? 'success' : incident.impact === 'major' ? 'danger' : incident.impact === 'minor' ? 'warning' : 'info'}>
                                    {incident.resolved_at ? 'Resolved' : `${IMPACTS[incident.impact]} · ${STATUSES[incident.status]}`}
                                </Badge>
                                {incident.announced && (
                                    <Badge size={'sm'} variant={'soft'} tone={'accent'}>
                                        Announced
                                    </Badge>
                                )}
                                {!incident.resolved_at && (
                                    <Button.Text size={'small'} onClick={() => setPosting(incident)}>
                                        Post update
                                    </Button.Text>
                                )}
                                <Button.Danger size={'small'} isSecondary onClick={() => setRemoving({ kind: 'incident', item: incident })}>
                                    Delete
                                </Button.Danger>
                            </div>
                            <ol className={'pst:flex pst:flex-col pst:gap-1.5 pst:text-sm'}>
                                {incident.updates.map((update) => (
                                    <li key={update.id}>
                                        <span className={'pst:font-medium'}>{STATUSES[update.status]}</span> <span className={'pst:text-xs pst:text-muted-foreground'}>{formatDate(update.created_at, 'MMM D, HH:mm')}</span>
                                        <p className={'pst:whitespace-pre-line pst:text-muted-foreground'}>{update.body}</p>
                                    </li>
                                ))}
                            </ol>
                        </article>
                    ))}
                </section>
            </div>

            {editing && (
                <ComponentDialog
                    component={editing === 'new' ? null : editing}
                    groups={groups}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void refresh();
                    }}
                />
            )}

            {posting && (
                <IncidentDialog
                    incident={posting === 'new' ? null : posting}
                    components={list}
                    canAnnounce={incidents.data?.meta.announce ?? false}
                    onClose={() => setPosting(null)}
                    onSaved={() => {
                        setPosting(null);
                        void refresh();
                    }}
                />
            )}

            {removing && (
                <Dialog.Confirm
                    open
                    title={removing.kind === 'component' ? `Remove ${removing.item.label}?` : `Delete "${removing.item.title}"?`}
                    confirm={removing.kind === 'component' ? 'Remove' : 'Delete'}
                    pending={busy}
                    onClose={() => setRemoving(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            if (removing.kind === 'component') await removeComponent(removing.item.id);
                            else await removeIncident(removing.item.id);
                            setRemoving(null);
                            await refresh();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {removing.kind === 'component' ? 'It leaves the status page with its uptime history. The node or server itself is not touched.' : 'It leaves the status page with all its updates. If it is the panel\'s announcement, that comes down too.'}
                </Dialog.Confirm>
            )}
        </PageContentBlock>
    );
}
