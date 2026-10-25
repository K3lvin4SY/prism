/** Path helpers. Paths in Prism File Browser are absolute from the server's root: "/plugins/x.yml". */

export function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, '/').split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }

    return '/' + parts.join('/');
}

export function join(...parts: string[]): string {
    return normalize(parts.join('/'));
}

export function dirname(path: string): string {
    const clean = normalize(path);

    return clean === '/' ? '/' : normalize(clean.slice(0, clean.lastIndexOf('/')));
}

export function basename(path: string): string {
    const clean = normalize(path);

    return clean.slice(clean.lastIndexOf('/') + 1);
}

export function extension(name: string): string {
    const dot = name.lastIndexOf('.');

    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** A hidden or protected path pattern as a regular expression; mirrors Paths::regex on the backend. */
export function patternRegex(pattern: string): RegExp {
    const anchored = pattern.startsWith('/');
    const glob = pattern.replace(/^\/+|\/+$/g, '');
    let body = '';
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === '*' && glob[i + 1] === '*') {
            body += '.*';
            i++;
        } else if (char === '*') body += '[^/]*';
        else if (char === '?') body += '[^/]';
        else body += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return new RegExp(`${anchored ? '^/' : '(^|/)'}${body}(/.*)?$`);
}

export function parsePatterns(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Whether the path, or something protected inside it, matches a pattern. */
export function matchesAny(path: string, patterns: string[], includeChildren = true): boolean {
    const clean = normalize(path);

    return patterns.some(
        (pattern) =>
            patternRegex(pattern).test(clean) ||
            (includeChildren && pattern.startsWith('/') && clean !== '/' && (pattern.replace(/\/+$/, '') + '/').startsWith(clean.replace(/\/+$/, '') + '/'))
    );
}

const LANGUAGES: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    json: 'json', json5: 'json', mcmeta: 'json', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', env: 'ini',
    xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', md: 'markdown', markdown: 'markdown',
    sh: 'shell', bash: 'shell', zsh: 'shell', bat: 'bat', cmd: 'bat', ps1: 'powershell', py: 'python', lua: 'lua', java: 'java', kt: 'kotlin', kts: 'kotlin',
    groovy: 'java', gradle: 'java', go: 'go', rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', rb: 'ruby', sql: 'sql',
    dockerfile: 'dockerfile', txt: 'plaintext', log: 'plaintext', sk: 'plaintext',
};

export function languageFor(name: string): string {
    const lower = name.toLowerCase();
    if (lower === 'dockerfile') return 'dockerfile';
    if (lower === '.pteroignore' || lower === '.gitignore' || lower === 'eula.txt') return 'ini';

    return LANGUAGES[extension(lower)] ?? 'plaintext';
}

const BINARY = new Set(['jar', 'zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'xz', 'bz2', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'mp3', 'ogg', 'wav', 'flac', 'mp4', 'webm', 'mkv', 'dat', 'mca', 'mcr', 'nbt', 'db', 'sqlite', 'so', 'dll', 'exe', 'bin', 'class', 'wld', 'twld', 'tmod', 'pdf', 'ttf', 'otf', 'woff', 'woff2']);

/** Whether the editor should open the file: text by mimetype, or a name that is usually text. */
export function isEditable(name: string, mimetype: string): boolean {
    if (BINARY.has(extension(name))) return false;

    return mimetype.startsWith('text/') || mimetype.includes('json') || mimetype.includes('xml') || mimetype.includes('yaml') || mimetype === 'inode/x-empty' || mimetype === 'application/x-empty' || extension(name) in LANGUAGES || !name.includes('.');
}

export type PreviewKind = 'image' | 'audio' | 'video' | 'text' | null;

export function previewKind(name: string, mimetype: string): PreviewKind {
    if (mimetype.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(extension(name))) return 'image';
    if (mimetype.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'flac'].includes(extension(name))) return 'audio';
    if (mimetype.startsWith('video/') || ['mp4', 'webm'].includes(extension(name))) return 'video';

    return isEditable(name, mimetype) ? 'text' : null;
}

export function isArchive(name: string): boolean {
    return /\.(zip|tar|tar\.gz|tgz|gz|rar|7z|tar\.xz|xz|tar\.bz2|bz2)$/i.test(name);
}

/** An icon and color per file type, as VS Code's explorer shows them. */
export function fileIcon(name: string, directory: boolean): { icon: string; color: string } {
    if (directory) return { icon: 'folder', color: 'pfl:text-sky-400' };
    const ext = extension(name);
    if (['yml', 'yaml'].includes(ext)) return { icon: 'file-cog', color: 'pfl:text-pink-400' };
    if (['json', 'json5', 'mcmeta'].includes(ext)) return { icon: 'file-braces', color: 'pfl:text-amber-400' };
    if (['properties', 'toml', 'ini', 'cfg', 'conf', 'env'].includes(ext)) return { icon: 'file-sliders', color: 'pfl:text-orange-300' };
    if (['jar', 'zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'xz'].includes(ext)) return { icon: 'file-archive', color: 'pfl:text-violet-400' };
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return { icon: 'file-image', color: 'pfl:text-emerald-400' };
    if (['mp3', 'ogg', 'wav', 'flac'].includes(ext)) return { icon: 'file-music', color: 'pfl:text-fuchsia-400' };
    if (['mp4', 'webm', 'mkv'].includes(ext)) return { icon: 'file-video-camera', color: 'pfl:text-fuchsia-400' };
    if (['log', 'txt', 'md'].includes(ext)) return { icon: 'file-text', color: 'pfl:text-slate-300' };
    if (['js', 'ts', 'py', 'lua', 'java', 'sh', 'kt', 'go', 'rs', 'php', 'sk'].includes(ext)) return { icon: 'file-code', color: 'pfl:text-cyan-400' };

    return { icon: 'file', color: 'pfl:text-slate-400' };
}
