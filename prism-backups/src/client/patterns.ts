/**
 * Gitignore rules, as Wings reads a backup's ignore list and .pteroignore: the last rule that
 * matches decides, and a path inside an ignored folder is ignored with it.
 */

export interface Rule {
    /** 1-based line number in the source. */
    line: number;
    text: string;
    negate: boolean;
    directoryOnly: boolean;
    regex: RegExp;
}

export function lines(text: string): string[] {
    return text
        .split(/\r\n|\r|\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.trim() !== '');
}

function translate(pattern: string): string {
    let out = '';
    for (let index = 0; index < pattern.length; index++) {
        const char = pattern[index];
        if (char === '*') {
            if (pattern[index + 1] === '*') {
                const before = index === 0 || pattern[index - 1] === '/';
                const after = index + 2 === pattern.length || pattern[index + 2] === '/';
                if (before && after) {
                    if (index + 2 === pattern.length) {
                        out += '.*';
                    } else {
                        out += '(?:.*/)?';
                        index++;
                    }
                    index++;
                    continue;
                }
            }
            out += '[^/]*';
        } else if (char === '?') {
            out += '[^/]';
        } else if (char === '[') {
            const end = pattern.indexOf(']', index + 2);
            if (end === -1) {
                out += '\\[';
            } else {
                let body = pattern.slice(index + 1, end).replace(/\\/g, '\\\\');
                if (body.startsWith('!')) body = `^${body.slice(1)}`;
                out += `[${body}]`;
                index = end;
            }
        } else if (char === '\\' && index + 1 < pattern.length) {
            out += pattern[++index].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        } else {
            out += char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        }
    }

    return out;
}

export function compile(source: string | string[]): Rule[] {
    const all = typeof source === 'string' ? source.split(/\r\n|\r|\n/) : source;
    const rules: Rule[] = [];

    all.forEach((raw, index) => {
        let text = raw.trimEnd();
        if (text.trim() === '' || text.startsWith('#')) return;

        let negate = false;
        if (text.startsWith('!')) {
            negate = true;
            text = text.slice(1);
        } else if (text.startsWith('\\!') || text.startsWith('\\#')) {
            text = text.slice(1);
        }

        let directoryOnly = false;
        if (text.endsWith('/')) {
            directoryOnly = true;
            text = text.replace(/\/+$/, '');
        }

        const anchored = text.includes('/');
        text = text.replace(/^\/+/, '');
        if (text === '') return;

        const body = translate(text);
        rules.push({ line: index + 1, text: raw.trimEnd(), negate, directoryOnly, regex: new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`) });
    });

    return rules;
}

function last(rules: Rule[], path: string, directory: boolean): Rule | null {
    let found: Rule | null = null;
    for (const rule of rules) {
        if (rule.directoryOnly && !directory) continue;
        if (rule.regex.test(path)) found = rule;
    }

    return found;
}

export interface Decision {
    ignored: boolean;
    /** The rule that decided it, if any did. */
    rule: Rule | null;
    /** The folder above that decided it, when one did. */
    via: string | null;
}

/** Whether a backup leaves the path out, and which rule says so. */
export function decide(rules: Rule[], rawPath: string, directory = false): Decision {
    const path = rawPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const segments = path.split('/').filter(Boolean);

    for (let index = 1; index < segments.length; index++) {
        const parent = segments.slice(0, index).join('/');
        const rule = last(rules, parent, true);
        if (rule && !rule.negate) return { ignored: true, rule, via: parent };
    }

    const rule = last(rules, segments.join('/'), directory);

    return { ignored: !!rule && !rule.negate, rule, via: null };
}

/**
 * The ignore list for "Only what I pick": ignore everything, then take back each picked path, the
 * folders above it and everything inside it. Matches Profiles::includeLines() on the panel.
 */
export function includeLines(picked: string[]): string[] {
    const out = ['*'];
    for (const raw of picked) {
        const path = raw.replace(/\\/g, '/').replace(/^[/ ]+|[/ ]+$/g, '');
        if (path === '' || path.startsWith('#')) continue;

        const segments = path.split('/');
        for (let index = 1; index < segments.length; index++) out.push(`!/${segments.slice(0, index).join('/')}/`);
        out.push(`!/${path}`, `!/${path}/**`);
    }

    return [...new Set(out)];
}

/** What Wings is sent for a profile; .pteroignore comes first when the profile includes it. */
export function profileLines(mode: 'exclude' | 'include', patterns: string, pteroignore: string | null, applyPteroignore: boolean): string[] {
    if (mode === 'include') return includeLines(lines(patterns));

    return [...(applyPteroignore && pteroignore ? lines(pteroignore) : []), ...lines(patterns)];
}
