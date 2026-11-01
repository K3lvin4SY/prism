import { useQuery, useQueryClient } from '@tanstack/react-query';
import { httpErrorToHuman, toast, useCurrentUser } from '@pterodactyl/sdk';
import { getNotes, notesKey, tickItem, type Notes } from '../api';
import { withTick } from './checklist';

/** The server's notes, and ticking an item at once with the server's answer following. */
export function useNotes(server: string, enabled = true) {
    const client = useQueryClient();
    const user = useCurrentUser();
    const query = useQuery({ queryKey: notesKey(server), queryFn: () => getNotes(server), enabled, retry: false });

    const tick = async (note: number, item: string, done: boolean) => {
        const key = notesKey(server);
        await client.cancelQueries({ queryKey: key });
        const before = client.getQueryData<Notes>(key);
        if (before) {
            client.setQueryData<Notes>(key, { ...before, notes: before.notes.map((entry) => (entry.id === note ? withTick(entry, item, done, user?.username ?? '') : entry)) });
        }
        try {
            const saved = await tickItem(server, note, item, done);
            client.setQueryData<Notes>(key, (current) => (current ? { ...current, notes: current.notes.map((entry) => (entry.id === note ? saved : entry)) } : current));
        } catch (error) {
            if (before) client.setQueryData(key, before);
            toast.error(httpErrorToHuman(error));
        }
    };

    return { query, tick, refresh: () => client.invalidateQueries({ queryKey: notesKey(server) }) };
}
