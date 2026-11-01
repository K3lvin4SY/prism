import { http } from '@pterodactyl/sdk';

export type NoteKind = 'note' | 'checklist';

export interface ChecklistItem {
    id: string;
    text: string;
    done: boolean;
    done_by: string | null;
    done_at: string | null;
}

export interface Note {
    id: number;
    kind: NoteKind;
    title: string;
    /** Markdown, shown without raw HTML. */
    body: string;
    items: ChecklistItem[];
    pinned: boolean;
    color: string | null;
    position: number;
    by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface Notes {
    notes: Note[];
    can_manage: boolean;
    max_notes: number;
}

export interface NoteInput {
    kind?: NoteKind;
    title?: string;
    body?: string;
    /** Items without an id are new; the server gives them one. */
    items?: { id?: string; text: string; done: boolean }[];
    pinned?: boolean;
    color?: string | null;
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-notes`;

export const notesKey = (server: string) => ['prism-notes', server, 'notes'] as const;

export const getNotes = async (server: string) => (await http.get<{ data: Notes }>(`${base(server)}/notes`)).data.data;

export const createNote = async (server: string, input: NoteInput) => (await http.post<{ data: Note }>(`${base(server)}/notes`, input)).data.data;

export const updateNote = async (server: string, id: number, input: NoteInput) => (await http.patch<{ data: Note }>(`${base(server)}/notes/${id}`, input)).data.data;

export const tickItem = async (server: string, id: number, item: string, done: boolean) => (await http.patch<{ data: Note }>(`${base(server)}/notes/${id}/items/${item}`, { done })).data.data;

export const orderNotes = (server: string, ids: number[]) => http.post(`${base(server)}/notes/order`, { ids });

export const deleteNote = (server: string, id: number) => http.delete(`${base(server)}/notes/${id}`);
