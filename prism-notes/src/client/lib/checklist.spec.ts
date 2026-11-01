import { describe, expect, it } from 'vitest';
import type { Note } from '../api';
import { move, progress, sorted, withTick } from './checklist';

const note = (id: number, pinned = false, position = 0): Note => ({
    id,
    kind: 'checklist',
    title: `Note ${id}`,
    body: '',
    items: [
        { id: 'a', text: 'Back up', done: false, done_by: null, done_at: null },
        { id: 'b', text: 'Restart', done: true, done_by: 'alex', done_at: '2026-11-01T10:00:00Z' },
    ],
    pinned,
    color: null,
    position,
    by: 'alex',
    updated_by: 'alex',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
});

describe('withTick', () => {
    it('ticks an item and records who', () => {
        const ticked = withTick(note(1), 'a', true, 'sam');
        expect(ticked.items[0]).toMatchObject({ done: true, done_by: 'sam' });
        expect(ticked.items[0].done_at).not.toBeNull();
    });

    it('unticks and forgets who ticked it', () => {
        expect(withTick(note(1), 'b', false, 'sam').items[1]).toMatchObject({ done: false, done_by: null, done_at: null });
    });

    it('leaves an item already in that state alone', () => {
        expect(withTick(note(1), 'b', true, 'sam').items[1].done_by).toBe('alex');
    });
});

describe('progress', () => {
    it('counts ticked items', () => {
        expect(progress(note(1).items)).toEqual({ done: 1, total: 2 });
    });
});

describe('sorted and move', () => {
    const notes = [note(1, false, 1), note(2, true, 5), note(3, false, 0)];

    it('puts pinned notes first, then by position', () => {
        expect(sorted(notes).map((entry) => entry.id)).toEqual([2, 3, 1]);
    });

    it('moves a note among notes of the same pinned state', () => {
        expect(move(notes, 1, -1).map((entry) => entry.id)).toEqual([2, 1, 3]);
    });

    it('does not move an unpinned note above a pinned one', () => {
        expect(move(notes, 3, -1).map((entry) => entry.id)).toEqual([2, 3, 1]);
    });
});
