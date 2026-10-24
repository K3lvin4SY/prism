import { type CompoundTag, type Tag } from './nbtio';

/**
 * SNBT, the text form of NBT the game uses in commands, for the raw item editor. Numbers carry
 * their type as a suffix (1b, 2s, 3, 4L, 5.0f, 6.0d), so text written here reads back exactly.
 */

const plainKey = /^[A-Za-z0-9._+-]+$/;
const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const float = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));

export function stringify(value: Tag, indent = '  ', depth = 0): string {
    const pad = indent.repeat(depth + 1);
    const end = indent.repeat(depth);
    switch (value.type) {
        case 1:
            return `${value.value}b`;
        case 2:
            return `${value.value}s`;
        case 3:
            return String(value.value);
        case 4:
            return `${value.value}L`;
        case 5:
            return `${float(value.value)}f`;
        case 6:
            return `${float(value.value)}d`;
        case 8:
            return quote(value.value);
        case 7:
            return `[B; ${[...value.value].map((item) => `${item}b`).join(', ')}]`;
        case 11:
            return `[I; ${[...value.value].join(', ')}]`;
        case 12:
            return `[L; ${[...value.value].map((item) => `${item}L`).join(', ')}]`;
        case 9:
            if (value.value.length === 0) return '[]';
            if (value.value.every((item) => item.type !== 9 && item.type !== 10)) return `[${value.value.map((item) => stringify(item)).join(', ')}]`;

            return `[\n${value.value.map((item) => pad + stringify(item, indent, depth + 1)).join(',\n')}\n${end}]`;
        case 10:
            if (value.value.size === 0) return '{}';

            return `{\n${[...value.value].map(([key, child]) => `${pad}${plainKey.test(key) ? key : quote(key)}: ${stringify(child, indent, depth + 1)}`).join(',\n')}\n${end}}`;
    }
}

class Parser {
    private at = 0;

    constructor(private readonly text: string) {}

    private fail(message: string): never {
        const line = this.text.slice(0, this.at).split('\n').length;
        throw new Error(`${message} (line ${line})`);
    }

    private space() {
        while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at++;
    }

    private peek(): string {
        this.space();

        return this.text[this.at] ?? '';
    }

    private expect(char: string) {
        if (this.peek() !== char) this.fail(`Expected "${char}"`);
        this.at++;
    }

    private quoted(): string {
        const mark = this.text[this.at++];
        let out = '';
        while (this.at < this.text.length) {
            const char = this.text[this.at++];
            if (char === '\\') out += this.text[this.at++] ?? '';
            else if (char === mark) return out;
            else out += char;
        }

        return this.fail('A quoted text never ends');
    }

    private bare(): string {
        const start = this.at;
        while (this.at < this.text.length && /[A-Za-z0-9._+-]/.test(this.text[this.at])) this.at++;
        if (start === this.at) this.fail('Expected a value');

        return this.text.slice(start, this.at);
    }

    private key(): string {
        const char = this.peek();

        return char === '"' || char === "'" ? this.quoted() : this.bare();
    }

    value(): Tag {
        const char = this.peek();
        if (char === '{') return this.compound();
        if (char === '[') return this.list();
        if (char === '"' || char === "'") return { type: 8, value: this.quoted() };

        return this.scalar(this.bare());
    }

    private scalar(word: string): Tag {
        const number = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([bslfdBSLFD]?)$/.exec(word);
        if (!number) {
            if (word === 'true') return { type: 1, value: 1 };
            if (word === 'false') return { type: 1, value: 0 };

            return { type: 8, value: word };
        }
        const [, digits, suffix] = number;
        const whole = /^[+-]?\d+$/.test(digits);
        switch (suffix.toLowerCase()) {
            case 'b':
                return { type: 1, value: Number(digits) };
            case 's':
                return { type: 2, value: Number(digits) };
            case 'l':
                return { type: 4, value: BigInt(digits) };
            case 'f':
                return { type: 5, value: Number(digits) };
            case 'd':
                return { type: 6, value: Number(digits) };
            default:
                return whole ? { type: 3, value: Number(digits) } : { type: 6, value: Number(digits) };
        }
    }

    private compound(): CompoundTag {
        this.expect('{');
        const value = new Map<string, Tag>();
        if (this.peek() === '}') {
            this.at++;

            return { type: 10, value };
        }
        for (;;) {
            const key = this.key();
            this.expect(':');
            value.set(key, this.value());
            const next = this.peek();
            this.at++;
            if (next === '}') return { type: 10, value };
            if (next !== ',') this.fail('Expected "," or "}"');
        }
    }

    private list(): Tag {
        this.expect('[');
        const typed = /^([BIL])\s*;/.exec(this.text.slice(this.at).trimStart());
        if (typed) {
            this.space();
            this.at += typed[0].length;
            const items: Tag[] = [];
            while (this.peek() !== ']') {
                items.push(this.scalar(this.bare()));
                if (this.peek() === ',') this.at++;
            }
            this.at++;
            const numbers = items.map((item) => (item.type === 4 ? item.value : BigInt(Math.trunc(Number((item as { value: number }).value)))));
            if (typed[1] === 'B') return { type: 7, value: Int8Array.from(numbers.map(Number)) };
            if (typed[1] === 'I') return { type: 11, value: Int32Array.from(numbers.map(Number)) };

            return { type: 12, value: BigInt64Array.from(numbers) };
        }
        const items: Tag[] = [];
        if (this.peek() === ']') {
            this.at++;

            return { type: 9, element: 0, value: items };
        }
        for (;;) {
            items.push(this.value());
            const next = this.peek();
            this.at++;
            if (next === ']') break;
            if (next !== ',') this.fail('Expected "," or "]"');
        }
        if (items.some((item) => item.type !== items[0].type)) this.fail('A list must hold values of one type');

        return { type: 9, element: items[0].type, value: items };
    }

    done() {
        if (this.peek() !== '') this.fail('Unexpected text after the end');
    }
}

/** Reads SNBT text into a compound, or throws a message saying where it went wrong. */
export function parseCompound(text: string): CompoundTag {
    const parser = new Parser(text);
    const value = parser.value();
    parser.done();
    if (value.type !== 10) throw new Error('An item must be a compound: { … }');

    return value;
}
