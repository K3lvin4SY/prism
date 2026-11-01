import type { ChecklistItem, Note } from '../api';

/** The note with one item ticked or unticked, as the server will save it; for an optimistic update. */
export function withTick(note: Note, item: string, done: boolean, by: string): Note {
    return {
        ...note,
        items: note.items.map((entry) => (entry.id === item && entry.done !== done ? { ...entry, done, done_by: done ? by : null, done_at: done ? new Date().toISOString() : null } : entry)),
    };
}

/** How many of a checklist's items are ticked, and of how many. */
export function progress(items: ChecklistItem[]): { done: number; total: number } {
    return { done: items.filter((item) => item.done).length, total: items.length };
}

/** Pinned first, then by position, then newest first: the order the server lists them in. */
export function sorted(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position || b.id - a.id);
}

/** The list with one note moved by `by` places among the notes of the same pinned state. */
export function move(notes: Note[], id: number, by: -1 | 1): Note[] {
    const list = sorted(notes);
    const from = list.findIndex((note) => note.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.length || list[to].pinned !== list[from].pinned) return list;
    [list[from], list[to]] = [list[to], list[from]];

    return list.map((note, position) => ({ ...note, position }));
}
