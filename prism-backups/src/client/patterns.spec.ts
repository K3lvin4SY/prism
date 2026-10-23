import { describe, expect, it } from 'vitest';
import { compile, decide, includeLines, profileLines } from './patterns';

const ignored = (rules: string, path: string, directory = false) => decide(compile(rules), path, directory).ignored;

describe('decide', () => {
    it('matches a name at any depth without a slash', () => {
        expect(ignored('*.log', 'latest.log')).toBe(true);
        expect(ignored('*.log', 'logs/2026/latest.log')).toBe(true);
        expect(ignored('*.log', 'logs/latest.txt')).toBe(false);
    });

    it('anchors patterns with a slash to the root', () => {
        expect(ignored('/cache', 'cache')).toBe(true);
        expect(ignored('/cache', 'plugins/cache')).toBe(false);
        expect(ignored('plugins/cache', 'plugins/cache/x.bin')).toBe(true);
    });

    it('leaves a folder out with everything in it', () => {
        expect(ignored('logs/', 'logs', true)).toBe(true);
        expect(ignored('logs/', 'logs/latest.log')).toBe(true);
        // A file called logs is not a folder.
        expect(ignored('logs/', 'logs', false)).toBe(false);
    });

    it('lets the last matching rule win, and says which', () => {
        const rules = compile('*.jar\n!server.jar');
        expect(decide(rules, 'server.jar').ignored).toBe(false);
        expect(decide(rules, 'server.jar').rule?.line).toBe(2);
        expect(decide(rules, 'plugins/x.jar').rule?.line).toBe(1);
    });

    it('does not take back a file inside an ignored folder', () => {
        const decision = decide(compile('logs/\n!logs/keep.txt'), 'logs/keep.txt');
        expect(decision.ignored).toBe(true);
        expect(decision.via).toBe('logs');
    });

    it('understands **, ? and character classes', () => {
        expect(ignored('**/cache', 'a/b/cache')).toBe(true);
        expect(ignored('world/**', 'world/region/r.0.0.mca')).toBe(true);
        expect(ignored('a/**/z', 'a/z')).toBe(true);
        expect(ignored('a/**/z', 'a/b/c/z')).toBe(true);
        expect(ignored('file?.txt', 'file1.txt')).toBe(true);
        expect(ignored('file[0-9].txt', 'filex.txt')).toBe(false);
        expect(ignored('file[!0-9].txt', 'filex.txt')).toBe(true);
    });

    it('skips comments and blank lines', () => {
        expect(compile('# hello\n\n  \nfoo')).toHaveLength(1);
        expect(compile('\\#hash')[0].regex.test('#hash')).toBe(true);
    });
});

describe('includeLines', () => {
    it('ignores everything except the picked paths, their folders and their contents', () => {
        const result = includeLines(['world', 'plugins/LuckPerms/', 'server.properties']);
        expect(result).toEqual(['*', '!/world', '!/world/**', '!/plugins/', '!/plugins/LuckPerms', '!/plugins/LuckPerms/**', '!/server.properties', '!/server.properties/**']);

        const rules = compile(result);
        expect(decide(rules, 'world/region/r.0.0.mca').ignored).toBe(false);
        expect(decide(rules, 'plugins/LuckPerms/config.yml').ignored).toBe(false);
        expect(decide(rules, 'plugins/Other.jar').ignored).toBe(true);
        expect(decide(rules, 'logs/latest.log').ignored).toBe(true);
        expect(decide(rules, 'server.properties').ignored).toBe(false);
        expect(decide(rules, 'eula.txt').ignored).toBe(true);
    });
});

describe('profileLines', () => {
    it('puts .pteroignore first when asked', () => {
        expect(profileLines('exclude', 'logs/\n\ncache/', '*.tmp', true)).toEqual(['*.tmp', 'logs/', 'cache/']);
        expect(profileLines('exclude', 'logs/', '*.tmp', false)).toEqual(['logs/']);
    });
});
