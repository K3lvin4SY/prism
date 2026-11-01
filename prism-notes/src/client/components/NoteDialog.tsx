import { useState } from 'react';
import { Alert, Button, Dialog, Input, Switch, TextArea, httpErrorToHuman } from '@pterodactyl/sdk';
import { createNote, updateNote, type Note, type NoteKind } from '../api';
import { NamedIcon } from '../icons';

const eyebrow = 'pnt:font-mono pnt:text-xs pnt:font-medium pnt:uppercase pnt:tracking-[0.18em] pnt:text-muted-foreground';

/** A few colors to tell notes apart at a glance; none is the default. */
export const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

interface Draft {
    key: string;
    id?: string;
    text: string;
    done: boolean;
    /** Added in this dialog, so it takes the focus when it appears. */
    fresh?: boolean;
}

let counter = 0;
const draftKey = () => `new-${++counter}`;

/** Writing or changing a note: its kind, title, text, checklist items, color and whether it is pinned. */
export default function NoteDialog({ server, note, onClose, onSaved }: { server: string; note: Note | null; onClose: () => void; onSaved: (saved: Note) => void }) {
    const [kind, setKind] = useState<NoteKind>(note?.kind ?? 'note');
    const [title, setTitle] = useState(note?.title ?? '');
    const [body, setBody] = useState(note?.body ?? '');
    const [items, setItems] = useState<Draft[]>(note?.items.map((item) => ({ key: item.id, id: item.id, text: item.text, done: item.done })) ?? []);
    const [color, setColor] = useState<string | null>(note?.color ?? null);
    const [pinned, setPinned] = useState(note?.pinned ?? false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const kept = items.filter((item) => item.text.trim() !== '');
    const ready = title.trim() !== '' && (kind === 'note' || kept.length > 0);

    const setItem = (key: string, change: Partial<Draft>) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const input = {
                kind,
                title: title.trim(),
                body,
                items: kind === 'checklist' ? kept.map(({ id, text, done }) => ({ ...(id ? { id } : {}), text: text.trim(), done })) : [],
                color,
                pinned,
            };
            onSaved(note ? await updateNote(server, note.id, input) : await createNote(server, input));
        } catch (caught) {
            setError(httpErrorToHuman(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={note ? 'Change note' : 'New note'}>
            <div className={'pnt:flex pnt:flex-col pnt:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                <div className={'pnt:flex pnt:gap-2'} role={'radiogroup'} aria-label={'Kind'}>
                    {(['note', 'checklist'] as const).map((value) => {
                        const Choice = kind === value ? Button : Button.Text;

                        return (
                            <Choice key={value} size={'small'} role={'radio'} aria-checked={kind === value} onClick={() => setKind(value)}>
                                <NamedIcon name={value === 'note' ? 'sticky-note' : 'list-checks'} size={14} className={'pnt:mr-1'} />
                                {value === 'note' ? 'Note' : 'Checklist'}
                            </Choice>
                        );
                    })}
                </div>

                <label className={'pnt:flex pnt:flex-col pnt:gap-1.5'}>
                    <span className={eyebrow}>Title</span>
                    <Input value={title} maxLength={120} placeholder={kind === 'note' ? 'Restart before updating mods' : 'After every update'} onChange={(event) => setTitle(event.target.value)} />
                </label>

                <label className={'pnt:flex pnt:flex-col pnt:gap-1.5'}>
                    <span className={eyebrow}>{kind === 'note' ? 'Text' : 'Text above the list (optional)'}</span>
                    <TextArea value={body} rows={kind === 'note' ? 8 : 3} maxLength={20000} onChange={(event) => setBody(event.target.value)} placeholder={'**Bold**, *italic*, `code`, - lists and [links](https://…) work here.'} />
                </label>

                {kind === 'checklist' && (
                    <div className={'pnt:flex pnt:flex-col pnt:gap-1.5'}>
                        <span className={eyebrow}>Items</span>
                        {items.map((item, index) => (
                            <div key={item.key} className={'pnt:flex pnt:items-center pnt:gap-2'}>
                                <Input
                                    autoFocus={item.fresh}
                                    value={item.text}
                                    maxLength={300}
                                    aria-label={`Item ${index + 1}`}
                                    placeholder={'Back up the world'}
                                    onChange={(event) => setItem(item.key, { text: event.target.value })}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            setItems((list) => [...list.slice(0, index + 1), { key: draftKey(), text: '', done: false, fresh: true }, ...list.slice(index + 1)]);
                                        }
                                    }}
                                />
                                <Button.Text size={'small'} aria-label={'Remove item'} onClick={() => setItems((list) => list.filter((entry) => entry.key !== item.key))}>
                                    <NamedIcon name={'x'} size={14} />
                                </Button.Text>
                            </div>
                        ))}
                        <div>
                            <Button.Text size={'small'} disabled={items.length >= 100} onClick={() => setItems((list) => [...list, { key: draftKey(), text: '', done: false, fresh: true }])}>
                                <NamedIcon name={'plus'} size={14} className={'pnt:mr-1'} /> Add item
                            </Button.Text>
                        </div>
                    </div>
                )}

                <div className={'pnt:flex pnt:flex-wrap pnt:items-center pnt:justify-between pnt:gap-3'}>
                    <div className={'pnt:flex pnt:items-center pnt:gap-1.5'} role={'radiogroup'} aria-label={'Color'}>
                        <button
                            type={'button'}
                            role={'radio'}
                            aria-checked={color === null}
                            aria-label={'No color'}
                            onClick={() => setColor(null)}
                            className={'pnt:flex pnt:size-6 pnt:items-center pnt:justify-center pnt:rounded-full pnt:border pnt:border-border pnt:text-muted-foreground ' + (color === null ? 'pnt:ring-2 pnt:ring-primary' : '')}
                        >
                            <NamedIcon name={'ban'} size={12} />
                        </button>
                        {COLORS.map((value) => (
                            <button
                                key={value}
                                type={'button'}
                                role={'radio'}
                                aria-checked={color === value}
                                aria-label={value}
                                onClick={() => setColor(value)}
                                className={'pnt:size-6 pnt:rounded-full ' + (color === value ? 'pnt:ring-2 pnt:ring-primary pnt:ring-offset-2 pnt:ring-offset-card' : '')}
                                style={{ backgroundColor: value }}
                            />
                        ))}
                    </div>
                    <label className={'pnt:flex pnt:items-center pnt:gap-2 pnt:text-sm'}>
                        <Switch checked={pinned} onChange={setPinned} aria-label={'Pinned'} />
                        Pin to the top and above the console
                    </label>
                </div>
            </div>

            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void save()}>
                    {note ? 'Save' : 'Add note'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
