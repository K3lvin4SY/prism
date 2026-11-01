import { useServerPermission, type useCurrentServerRequired } from '@pterodactyl/sdk';
import { configStore } from '../config';
import NoteCard from '../components/NoteCard';
import { useNotes } from '../lib/useNotes';

/** Pinned notes above the console, for everyone who may read the server's notes. */
export default function PinnedNotes({ data: server }: { data: ReturnType<typeof useCurrentServerRequired> }) {
    const config = configStore.use();
    const allowed = useServerPermission(['ext.prism-notes.read', 'ext.prism-notes.manage'], true);
    const on = config.enabled && config.consolePinned && allowed;
    const { query, tick } = useNotes(server.attributes.identifier, on);
    const pinned = on ? (query.data?.notes ?? []).filter((note) => note.pinned) : [];

    if (pinned.length === 0) return null;

    return (
        <div className={'pnt:mb-4 pnt:grid pnt:gap-3 pnt:md:grid-cols-2 pnt:xl:grid-cols-3'}>
            {pinned.map((note) => (
                <NoteCard key={note.id} note={note} canManage={false} compact onTick={(item, done) => void tick(note.id, item, done)} />
            ))}
        </div>
    );
}
