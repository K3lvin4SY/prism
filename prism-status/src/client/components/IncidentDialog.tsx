import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, TextArea, httpErrorToHuman } from '@pterodactyl/sdk';
import { IMPACTS, STATUSES } from '../../status/lib';
import { createIncident, postUpdate, type AdminComponent, type AdminIncident, type Impact, type IncidentStatus } from '../api';

const eyebrow = 'pst:font-mono pst:text-xs pst:font-medium pst:uppercase pst:tracking-[0.18em] pst:text-muted-foreground';

function Choice<T extends string>({ options, value, onChange }: { options: Record<T, string>; value: T; onChange: (value: T) => void }) {
    return (
        <div role={'radiogroup'} className={'pst:flex pst:flex-wrap pst:gap-1 pst:self-start pst:rounded-lg pst:border pst:border-border pst:p-1'}>
            {(Object.keys(options) as T[]).map((key) => (
                <button key={key} type={'button'} role={'radio'} aria-checked={value === key} onClick={() => onChange(key)} className={'pst:rounded-md pst:px-3 pst:py-1 pst:text-sm ' + (value === key ? 'pst:bg-accent pst:font-semibold pst:text-accent-foreground' : 'pst:text-muted-foreground')}>
                    {options[key]}
                </button>
            ))}
        </div>
    );
}

/** A new incident, or a new post on one. */
export default function IncidentDialog({ incident, components, canAnnounce, onClose, onSaved }: { incident: AdminIncident | null; components: AdminComponent[]; canAnnounce: boolean; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState('');
    const [impact, setImpact] = useState<Impact>('minor');
    const [status, setStatus] = useState<IncidentStatus>(incident ? (incident.status === 'investigating' ? 'identified' : incident.status) : 'investigating');
    const [affected, setAffected] = useState<number[]>([]);
    const [body, setBody] = useState('');
    const [announce, setAnnounce] = useState(canAnnounce);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const statuses: Record<IncidentStatus, string> = incident ? STATUSES : { investigating: STATUSES.investigating, identified: STATUSES.identified, monitoring: STATUSES.monitoring } as Record<IncidentStatus, string>;
    const ready = body.trim() !== '' && (incident !== null || title.trim() !== '');

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            if (incident) await postUpdate(incident.id, { status, body: body.trim() });
            else await createIncident({ title: title.trim(), impact, status, components: affected, body: body.trim(), announce: canAnnounce && announce });
            onSaved();
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={incident ? `Update: ${incident.title}` : 'New incident'}>
            <div className={'pst:flex pst:flex-col pst:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                {incident === null && (
                    <>
                        <label className={'pst:flex pst:flex-col pst:gap-1.5'}>
                            <span className={eyebrow}>Title</span>
                            <Input value={title} maxLength={120} placeholder={'Game servers restarting slowly'} onChange={(event) => setTitle(event.target.value)} />
                        </label>
                        <div className={'pst:flex pst:flex-col pst:gap-1.5'}>
                            <span className={eyebrow}>Kind</span>
                            <Choice options={IMPACTS} value={impact} onChange={setImpact} />
                        </div>
                        {components.length > 0 && (
                            <fieldset className={'pst:flex pst:flex-col pst:gap-1.5'}>
                                <legend className={eyebrow + ' pst:mb-1.5'}>Affects</legend>
                                <div className={'pst:grid pst:gap-1.5 pst:sm:grid-cols-2'}>
                                    {components.map((component) => (
                                        <label key={component.id} className={'pst:flex pst:items-center pst:gap-2 pst:text-sm'}>
                                            <Checkbox checked={affected.includes(component.id)} onChange={(on: boolean) => setAffected((list) => (on ? [...list, component.id] : list.filter((id) => id !== component.id)))} />
                                            {component.label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                    </>
                )}
                <div className={'pst:flex pst:flex-col pst:gap-1.5'}>
                    <span className={eyebrow}>Status</span>
                    <Choice options={statuses} value={status} onChange={setStatus} />
                </div>
                <label className={'pst:flex pst:flex-col pst:gap-1.5'}>
                    <span className={eyebrow}>{incident ? 'What changed' : 'What is happening'}</span>
                    <TextArea rows={4} maxLength={5000} value={body} placeholder={status === 'resolved' ? 'Everything is back to normal.' : 'We are looking into it.'} onChange={(event) => setBody(event.target.value)} />
                    <span className={'pst:text-xs pst:text-muted-foreground'}>Shown on the public status page with the time.</span>
                </label>
                {incident === null && canAnnounce && (
                    <label className={'pst:flex pst:items-start pst:gap-2 pst:text-sm'}>
                        <Checkbox checked={announce} onChange={(on: boolean) => setAnnounce(on)} />
                        <span>
                            Also show it as the panel's announcement
                            <span className={'pst:block pst:text-xs pst:text-muted-foreground'}>Prism Layout's banner, linking here. Each update keeps it current; resolving takes it down and brings back the announcement you had before, unless it was changed since.</span>
                        </span>
                    </label>
                )}
                {incident?.announced && status === 'resolved' && <Alert type={'info'}>Resolving takes the panel's announcement down.</Alert>}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                    {incident ? (status === 'resolved' ? 'Resolve' : 'Post update') : 'Post incident'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
