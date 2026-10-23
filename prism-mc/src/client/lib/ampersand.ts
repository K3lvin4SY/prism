/**
 * Editing helpers for the MOTD line fields, which hold & codes.
 */

const CODE = /&(#[0-9a-fA-F]{6}|[0-9a-fk-orA-FK-OR])/g;

/** The codes in effect at a position, re-emitted so text after an edit keeps its look. */
export function activeCodesAt(text: string, position: number): string {
    let color = '';
    let styles = '';

    for (const match of text.slice(0, position).matchAll(CODE)) {
        const code = match[1].toLowerCase();
        if (code.startsWith('#') || /^[0-9a-f]$/.test(code)) {
            color = `&${match[1]}`;
            styles = '';
        } else if (code === 'r') {
            color = '';
            styles = '';
        } else if (!styles.includes(`&${code}`)) {
            styles += `&${code}`;
        }
    }

    return color + styles;
}

/**
 * Applies a code to a selection: the code goes before it and the previous formatting is
 * restored after it. With no selection the code is inserted at the cursor.
 */
export function applyCode(text: string, start: number, end: number, code: string): { text: string; cursor: number } {
    const insert = `&${code}`;
    if (start === end) {
        return { text: text.slice(0, start) + insert + text.slice(start), cursor: start + insert.length };
    }

    // A style keeps the current colour while a colour resets styles, as in game, so the
    // code alone is enough at the start. The end restores whatever was in effect there.
    const restore = end < text.length ? `&r${activeCodesAt(text, end)}` : '';
    const selection = text.slice(start, end);

    return {
        text: text.slice(0, start) + insert + selection + restore + text.slice(end),
        cursor: start + insert.length + selection.length,
    };
}

export function insertAt(text: string, start: number, end: number, value: string): { text: string; cursor: number } {
    return { text: text.slice(0, start) + value + text.slice(end), cursor: start + value.length };
}
