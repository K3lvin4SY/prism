import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, parse, safeHref } from './markdown';

describe('parse', () => {
    it('reads headings, lists, task lists, quotes and code', () => {
        const blocks = parse('# Before updating\n\n- [x] Back up\n- [ ] Restart\n\n1. one\n2. two\n\n> careful\n\n```\nsay hi\n```\nplain\ntext');
        expect(blocks.map((block) => block.type)).toEqual(['heading', 'list', 'list', 'quote', 'code', 'paragraph']);
        expect(blocks[1]).toEqual({ type: 'list', ordered: false, items: [{ text: 'Back up', task: true }, { text: 'Restart', task: false }] });
        expect(blocks[2]).toMatchObject({ ordered: true });
        expect(blocks[5]).toEqual({ type: 'paragraph', text: 'plain\ntext' });
    });
});

describe('safeHref', () => {
    it('allows web and mail links only', () => {
        expect(safeHref('https://example.com')).toBe('https://example.com');
        expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
        expect(safeHref('javascript:alert(1)')).toBeNull();
        expect(safeHref('data:text/html,x')).toBeNull();
    });
});

describe('Markdown', () => {
    it('never renders HTML from a note', () => {
        const { container } = render(<Markdown source={'<img src=x onerror=alert(1)> **bold** [bad](javascript:alert(1))'} />);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('strong')?.textContent).toBe('bold');
        expect(container.querySelector('a')).toBeNull();
        expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('makes web links clickable and opens them safely', () => {
        const { container } = render(<Markdown source={'See [the wiki](https://example.com/wiki).'} />);
        const link = container.querySelector('a')!;
        expect(link.getAttribute('href')).toBe('https://example.com/wiki');
        expect(link.getAttribute('rel')).toContain('noopener');
    });
});
