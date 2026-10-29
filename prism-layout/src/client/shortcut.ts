const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** A shortcut as useShortcut names it (`mod+k`, `/`, `f2`) as keys to show: ⌘ and K on a Mac, Ctrl and K elsewhere. */
export function shortcutKeys(keys: string): string[] {
    const mod = keys.startsWith('mod+');
    const key = keys.replace(/^mod\+/, '').toUpperCase();

    return mod ? [apple ? '⌘' : 'Ctrl', key] : [key];
}

/** The same as one label, such as Ctrl+K or ⌘K. */
export const shortcutLabel = (keys: string) => shortcutKeys(keys).join(apple ? '' : '+');
