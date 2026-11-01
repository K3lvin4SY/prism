import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, ServerContentBlock, Spinner, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { deleteNote, notesKey, orderNotes, updateNote, type Note, type Notes } from '../api';
import NoteCard from '../components/NoteCard';
import NoteDialog from '../components/NoteDialog';
import { NamedIcon } from '../icons';
import { move, sorted } from '../lib/checklist';
import { useNotes } from '../lib/useNotes';

const eyebrow = 'pnt:font-mono pnt:text-xs pnt:font-medium pnt:uppercase pnt:tracking-[0.18em] pnt:text-muted-foreground';

/** The server's "Notes" page: notes and checklists as cards, pinned ones first. */
export default function NotesScreen() {
    const server = useCurrentServerRequired();
    const id = server.attributes.identifier;
    const client = useQueryClient();
    const { query, tick, refresh } = useNotes(id);
    const [editing, setEditing] = useState<Note | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Note | null>(null);
    const [busy, setBusy] = useState(false);

    const data = query.data;
    const notes = data ? sorted(data.notes) : [];
    const full = data ? data.notes.length >= data.max_notes : false;

    const pin = async (note: Note) => {
        try {
            await updateNote(id, note.id, { pinned: !note.pinned });
            await refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const reorder = async (note: Note, by: -1 | 1) => {
        if (!data) return;
        const next = move(data.notes, note.id, by);
        client.setQueryData<Notes>(notesKey(id), { ...data, notes: next });
        try {
            await orderNotes(id, next.map((entry) => entry.id));
        } catch (error) {
            toast.error(httpErrorToHuman(error));
            await refresh();
        }
    };

    return (
        <ServerContentBlock title={'Notes'}>
            <div className={'pnt:flex pnt:flex-col pnt:gap-5'}>
                <header className={'pt-surface pnt:flex pnt:flex-wrap pnt:items-center pnt:gap-3 pnt:rounded-xl pnt:border pnt:border-border pnt:bg-card pnt:px-5 pnt:py-4'}>
                    <div className={'pnt:min-w-0 pnt:flex-1'}>
                        <div className={'pnt:flex pnt:flex-wrap pnt:items-baseline pnt:gap-x-3'}>
                            <h1 className={'pnt:font-header pnt:text-lg pnt:font-semibold'}>Notes</h1>
                            <span className={eyebrow + ' pnt:truncate'}>{server.attributes.name}</span>
                        </div>
                        <p className={'pnt:text-sm pnt:text-muted-foreground'}>
                            {data?.can_manage === false ? 'Notes and checklists for this server. You can tick checklist items.' : 'Notes and checklists for everyone who helps run this server.'}
                        </p>
                    </div>
                    {data?.can_manage && (
                        <Button disabled={full} title={full ? `This server has ${data.max_notes} notes, the most it may have.` : undefined} onClick={() => setEditing('new')}>
                            <NamedIcon name={'plus'} size={16} className={'pnt:mr-1'} /> New note
                        </Button>
                    )}
                </header>

                {query.isLoading && (
                    <div className={'pnt:flex pnt:justify-center pnt:py-10'}>
                        <Spinner />
                    </div>
                )}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {data && notes.length === 0 && (
                    <div className={'pt-surface pnt:flex pnt:flex-col pnt:items-center pnt:gap-2 pnt:rounded-xl pnt:border pnt:border-border pnt:bg-card pnt:py-12 pnt:text-center pnt:text-sm pnt:text-muted-foreground'}>
                        <NamedIcon name={'notebook-pen'} size={24} />
                        {data.can_manage ? 'No notes yet. Write down what everyone should know, like "restart before updating mods".' : 'No notes yet.'}
                    </div>
                )}

                {notes.length > 0 && (
                    <div className={'pnt:grid pnt:gap-4 pnt:sm:grid-cols-2 pnt:xl:grid-cols-3'}>
                        {notes.map((note) => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                canManage={data!.can_manage}
                                onTick={(item, done) => void tick(note.id, item, done)}
                                onEdit={() => setEditing(note)}
                                onPin={() => void pin(note)}
                                onDelete={() => setDeleting(note)}
                                onMove={notes.length > 1 ? (by) => void reorder(note, by) : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            {editing && (
                <NoteDialog
                    server={id}
                    note={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void refresh();
                    }}
                />
            )}

            {deleting && (
                <Dialog.Confirm
                    open
                    title={`Delete "${deleting.title}"?`}
                    confirm={'Delete'}
                    pending={busy}
                    onClose={() => setDeleting(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await deleteNote(id, deleting.id);
                            setDeleting(null);
                            await refresh();
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    The note is gone for everyone. This cannot be undone.
                </Dialog.Confirm>
            )}
        </ServerContentBlock>
    );
}
