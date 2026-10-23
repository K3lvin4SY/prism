import type { ConsoleLine } from './lines';

export type ExportFormat = 'txt' | 'log' | 'html';

function stamp(time: number, iso = false): string {
    const date = new Date(time);

    return iso ? date.toISOString() : date.toLocaleTimeString([], { hour12: false });
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** The 16 terminal colours as they are on the page, so a saved .html keeps them. */
function terminalColours(): string {
    const style = getComputedStyle(document.documentElement);
    const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

    return [...names, ...names.map((name) => `bright-${name}`)]
        .map((name) => `--terminal-ansi-${name}:${style.getPropertyValue(`--terminal-ansi-${name}`).trim() || 'inherit'}`)
        .join(';');
}

export function exportLines(lines: ConsoleLine[], format: ExportFormat, timestamps: boolean, title: string): string {
    if (format === 'html') {
        const body = lines
            .map((line) => {
                const text = line.segments
                    .map((segment) => {
                        const css = [segment.fg && `color:${segment.fg}`, segment.bg && `background:${segment.bg}`, segment.bold && 'font-weight:bold', segment.italic && 'font-style:italic', segment.underline && 'text-decoration:underline']
                            .filter(Boolean)
                            .join(';');

                        return css ? `<span style="${css}">${escapeHtml(segment.text)}</span>` : escapeHtml(segment.text);
                    })
                    .join('');

                return (timestamps ? `<span style="color:#64748b">[${stamp(line.time)}]</span> ` : '') + text;
            })
            .join('\n');

        return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#0f172a;color:#e2e8f0;${terminalColours()}"><pre style="margin:0;padding:16px;font:13px/1.4 ui-monospace,monospace;white-space:pre-wrap">${body}</pre></body></html>`;
    }

    return lines.map((line) => (timestamps ? `[${stamp(line.time, format === 'log')}] ` : '') + line.text).join('\n') + '\n';
}

export function download(content: string, name: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
