import { Fragment, type ReactNode } from 'react';

/**
 * A small markdown reader for notes: paragraphs, headings, bullet and numbered lists, task lists,
 * quotes, code blocks, **bold**, *italic*, `code` and links. It builds React elements, never HTML,
 * so nothing written in a note can run in someone else's browser.
 */
export type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; ordered: boolean; items: { text: string; task: boolean | null }[] }
    | { type: 'quote'; text: string }
    | { type: 'code'; text: string };

export function parse(source: string): Block[] {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
            index++;
            continue;
        }
        if (line.startsWith('```')) {
            const code: string[] = [];
            index++;
            while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
            index++;
            blocks.push({ type: 'code', text: code.join('\n') });
            continue;
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
            blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
            index++;
            continue;
        }
        if (line.startsWith('>')) {
            const quote: string[] = [];
            while (index < lines.length && lines[index].startsWith('>')) quote.push(lines[index++].replace(/^>\s?/, ''));
            blocks.push({ type: 'quote', text: quote.join(' ') });
            continue;
        }
        const bullet = /^\s*([-*+]|\d+[.)])\s+/;
        if (bullet.test(line)) {
            const ordered = /^\s*\d/.test(line);
            const items: { text: string; task: boolean | null }[] = [];
            while (index < lines.length && bullet.test(lines[index])) {
                const text = lines[index++].replace(bullet, '');
                const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
                items.push(task ? { text: task[2], task: task[1] !== ' ' } : { text, task: null });
            }
            blocks.push({ type: 'list', ordered, items });
            continue;
        }
        const paragraph: string[] = [];
        while (index < lines.length && lines[index].trim() !== '' && !/^(#{1,3}\s|>|```)/.test(lines[index]) && !bullet.test(lines[index])) paragraph.push(lines[index++]);
        blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    }

    return blocks;
}

/** Only web and mail links are made clickable; anything else (javascript:, data:) stays text. */
export const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null);

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g;

export function inline(text: string, prefix: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let last = 0;
    let key = 0;
    for (const match of text.matchAll(INLINE)) {
        const [token] = match;
        const at = match.index ?? 0;
        if (at > last) nodes.push(text.slice(last, at));
        last = at + token.length;
        const id = `${prefix}-${key++}`;
        if (match[1]) {
            nodes.push(<code key={id} className={'pnt:rounded pnt:bg-muted pnt:px-1 pnt:py-0.5 pnt:font-mono pnt:text-[0.85em]'}>{token.slice(1, -1)}</code>);
        } else if (match[2]) {
            nodes.push(<strong key={id}>{inline(token.slice(2, -2), id)}</strong>);
        } else if (match[3]) {
            nodes.push(<em key={id}>{inline(token.slice(1, -1), id)}</em>);
        } else {
            const link = match[4] ? /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) : null;
            const label = link ? link[1] : token;
            const href = safeHref(link ? link[2] : token);
            nodes.push(
                href ? (
                    <a key={id} href={href} target={'_blank'} rel={'noopener noreferrer nofollow'} className={'pnt:text-primary pnt:underline pnt:underline-offset-2'}>
                        {label}
                    </a>
                ) : (
                    <Fragment key={id}>{label}</Fragment>
                ),
            );
        }
    }
    if (last < text.length) nodes.push(text.slice(last));

    return nodes;
}

/** A note's body as React elements. */
export function Markdown({ source }: { source: string }) {
    return (
        <div className={'pnt:flex pnt:flex-col pnt:gap-2 pnt:text-sm pnt:leading-relaxed pnt:break-words'}>
            {parse(source).map((block, index) => {
                const key = `b${index}`;
                switch (block.type) {
                    case 'heading':
                        return (
                            <p key={key} className={block.level === 1 ? 'pnt:text-base pnt:font-semibold' : 'pnt:font-semibold'}>
                                {inline(block.text, key)}
                            </p>
                        );
                    case 'quote':
                        return (
                            <blockquote key={key} className={'pnt:border-l-2 pnt:border-border pnt:pl-3 pnt:text-muted-foreground'}>
                                {inline(block.text, key)}
                            </blockquote>
                        );
                    case 'code':
                        return (
                            <pre key={key} className={'pnt:overflow-x-auto pnt:rounded-md pnt:bg-muted pnt:p-2 pnt:font-mono pnt:text-xs'}>
                                {block.text}
                            </pre>
                        );
                    case 'list': {
                        const List = block.ordered ? 'ol' : 'ul';

                        return (
                            <List key={key} className={(block.ordered ? 'pnt:list-decimal' : 'pnt:list-disc') + ' pnt:flex pnt:flex-col pnt:gap-0.5 pnt:pl-5'}>
                                {block.items.map((item, at) => (
                                    <li key={at} className={item.task === null ? '' : 'pnt:list-none pnt:-ml-5'}>
                                        {item.task !== null && <span aria-hidden className={'pnt:mr-1.5 pnt:font-mono pnt:text-muted-foreground'}>{item.task ? '☑' : '☐'}</span>}
                                        <span className={item.task ? 'pnt:text-muted-foreground pnt:line-through' : ''}>{inline(item.text, `${key}-${at}`)}</span>
                                    </li>
                                ))}
                            </List>
                        );
                    }
                    default:
                        return (
                            <p key={key} className={'pnt:whitespace-pre-line'}>
                                {inline(block.text, key)}
                            </p>
                        );
                }
            })}
        </div>
    );
}
