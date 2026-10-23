import { describe, expect, it } from 'vitest';
import { cellText, snippets } from '../api';

describe('snippets', () => {
    const database = { host: '127.0.0.1', port: 3306, username: 'u1_abc', name: 's1_luckperms' };

    it('builds each connection string', () => {
        const result = snippets(database, 'p@ss:word/1');
        expect(result.CLI).toBe('mysql -h 127.0.0.1 -P 3306 -u u1_abc -p s1_luckperms');
        expect(result.URI).toBe('mysql://u1_abc:p%40ss%3Aword%2F1@127.0.0.1:3306/s1_luckperms');
        expect(result.JDBC).toBe('jdbc:mysql://127.0.0.1:3306/s1_luckperms?user=u1_abc&password=p%40ss%3Aword%2F1');
        expect(result['.env']).toContain('DB_PASSWORD=p@ss:word/1');
    });

    it('leaves a placeholder without the password', () => {
        expect(snippets(database, null).URI).toContain(':%3Cpassword%3E@');
    });

    it('shows cells', () => {
        expect(cellText(null)).toBe('NULL');
        expect(cellText({ binary: 40, hex: 'ab' })).toBe('(binary, 40 bytes) 0xab…');
        expect(cellText(12)).toBe('12');
    });
});
