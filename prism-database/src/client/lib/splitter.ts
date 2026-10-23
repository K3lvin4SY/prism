/**
 * The TypeScript twin of src/Support/SqlSplitter.php, kept line for line so the tests here
 * cover the PHP importer's rules. The SQL console also uses it to run a few statements in turn.
 */
export interface Statement {
    sql: string;
    end: number;
}

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);

export function isEmpty(sql: string): boolean {
    return sql.replace(/\/\*(?!!)[\s\S]*?\*\//g, '').replace(/^\s*(--\s|#).*$/gm, '').trim() === '';
}

export function isSkipped(sql: string): boolean {
    return /^(USE\s|CREATE\s+(DATABASE|SCHEMA)\s|DROP\s+(DATABASE|SCHEMA)\s)/i.test(sql.trimStart());
}

export class SqlSplitter {
    private buffer = '';
    private consumed: number;
    delimiter: string;

    constructor(offset = 0, delimiter = ';') {
        this.consumed = offset;
        this.delimiter = delimiter;
    }

    feed(chunk: string, final = false): Statement[] {
        this.buffer += chunk;
        const b = this.buffer;
        const n = b.length;
        const statements: Statement[] = [];
        let start = 0;
        let i = 0;
        let quote: string | null = null;

        const emit = (sql: string, end: number) => {
            const trimmed = sql.trim();
            if (!isEmpty(trimmed) && !isSkipped(trimmed)) statements.push({ sql: trimmed, end });
        };

        while (i < n) {
            const c = b[i];

            if (quote !== null) {
                if (c === '\\' && quote !== '`') {
                    i += 2;
                    continue;
                }
                if (c === quote) {
                    if (i + 1 >= n && !final) break;
                    if (b[i + 1] === quote) {
                        i += 2;
                        continue;
                    }
                    quote = null;
                }
                i++;
                continue;
            }

            if ((c === 'D' || c === 'd') && b.slice(start, i).trim() === '' && b.slice(i, i + 10).toUpperCase() === 'DELIMITER ') {
                let end = b.indexOf('\n', i);
                if (end < 0 && !final) break;
                if (end < 0) end = n;
                const value = b.slice(i + 10, end).trim();
                if (value !== '') this.delimiter = value;
                i = start = Math.min(n, end + 1);
                continue;
            }

            if (c === "'" || c === '"' || c === '`') {
                quote = c;
                i++;
                continue;
            }

            if (c === '#' || (c === '-' && b[i + 1] === '-' && (i + 2 >= n || isSpace(b[i + 2])))) {
                if (c === '-' && i + 2 >= n && !final) break;
                const end = b.indexOf('\n', i);
                if (end < 0 && !final) break;
                i = end < 0 ? n : end + 1;
                continue;
            }

            if (c === '/' && b[i + 1] === '*') {
                const end = b.indexOf('*/', i + 2);
                if (end < 0 && !final) break;
                i = end < 0 ? n : end + 2;
                continue;
            }

            if (c === this.delimiter[0] && b.slice(i, i + this.delimiter.length) === this.delimiter) {
                emit(b.slice(start, i), this.consumed + i + this.delimiter.length);
                i += this.delimiter.length;
                start = i;
                continue;
            }

            i++;
        }

        if (final) {
            emit(b.slice(start), this.consumed + n);
            start = n;
        }

        this.buffer = b.slice(start);
        this.consumed += start;

        return statements;
    }
}

export function splitSql(sql: string): string[] {
    return new SqlSplitter().feed(sql, true).map((statement) => statement.sql);
}
