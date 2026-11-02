import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Select, httpErrorToHuman } from '@pterodactyl/sdk';
import { addComponent, getCandidates, updateComponent, type AdminComponent } from '../api';

const eyebrow = 'pst:font-mono pst:text-xs pst:font-medium pst:uppercase pst:tracking-[0.18em] pst:text-muted-foreground';

/** Adding a node or server to the page, or renaming one already on it. */
export default function ComponentDialog({ component, groups, onClose, onSaved }: { component: AdminComponent | null; groups: string[]; onClose: () => void; onSaved: () => void }) {
    const [type, setType] = useState<'node' | 'server'>(component?.type ?? 'server');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<number | null>(component?.ref_id ?? null);
    const [label, setLabel] = useState(component?.label ?? '');
    const [group, setGroup] = useState(component?.group ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const candidates = useQuery({ queryKey: ['prism-status', 'candidates', type, search], queryFn: () => getCandidates(type, search), enabled: component === null });

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            if (component) await updateComponent(component.id, { label: label.trim(), group: group.trim() });
            else if (picked) await addComponent({ type, ref_id: picked, label: label.trim(), group: group.trim() });
            onSaved();
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={component ? `Change ${component.label}` : 'Add to the status page'}>
            <div className={'pst:flex pst:flex-col pst:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                {component === null && (
                    <>
                        <div role={'tablist'} className={'pst:flex pst:gap-1 pst:self-start pst:rounded-lg pst:border pst:border-border pst:p-1'}>
                            {(['server', 'node'] as const).map((item) => (
                                <button
                                    key={item}
                                    type={'button'}
                                    role={'tab'}
                                    aria-selected={type === item}
                                    onClick={() => {
                                        setType(item);
                                        setPicked(null);
                                    }}
                                    className={'pst:rounded-md pst:px-3 pst:py-1 pst:text-sm ' + (type === item ? 'pst:bg-accent pst:font-semibold pst:text-accent-foreground' : 'pst:text-muted-foreground')}
                                >
                                    {item === 'server' ? 'A server' : 'A node'}
                                </button>
                            ))}
                        </div>
                        <div className={'pst:flex pst:flex-col pst:gap-1.5'}>
                            <span className={eyebrow}>{type === 'server' ? 'Server' : 'Node'}</span>
                            <Select
                                value={picked}
                                placeholder={type === 'server' ? 'Pick a server' : 'Pick a node'}
                                searchPlaceholder={'Search'}
                                emptyMessage={candidates.isLoading ? 'Looking…' : 'Nothing left to add'}
                                onSearchChange={setSearch}
                                options={(candidates.data ?? []).map((item) => ({ value: item.id, textLabel: item.name, label: item.hint ? `${item.name} · ${item.hint}` : item.name }))}
                                onChange={(value) => {
                                    setPicked(Number(value));
                                    const found = candidates.data?.find((item) => item.id === Number(value));
                                    if (found && label.trim() === '') setLabel(found.name);
                                }}
                            />
                            <span className={'pst:text-xs pst:text-muted-foreground'}>{type === 'server' ? 'Up while it runs. A server stopped on purpose shows as down.' : 'Up while Wings answers. Maintenance mode shows as planned maintenance.'}</span>
                        </div>
                    </>
                )}
                <label className={'pst:flex pst:flex-col pst:gap-1.5'}>
                    <span className={eyebrow}>Name on the page</span>
                    <Input value={label} maxLength={64} placeholder={'Survival server'} onChange={(event) => setLabel(event.target.value)} />
                    <span className={'pst:text-xs pst:text-muted-foreground'}>Visitors see only this name, never the node's address or the server's id.</span>
                </label>
                <label className={'pst:flex pst:flex-col pst:gap-1.5'}>
                    <span className={eyebrow}>Group (optional)</span>
                    <Input value={group} maxLength={64} placeholder={'Game servers'} list={'pst-groups'} onChange={(event) => setGroup(event.target.value)} />
                    <datalist id={'pst-groups'}>
                        {groups.map((name) => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={label.trim() === '' || (component === null && picked === null)} isLoading={busy} onClick={() => void save()}>
                    {component ? 'Save' : 'Add'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
