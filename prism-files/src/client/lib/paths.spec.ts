import { describe, expect, it } from 'vitest';
import { basename, dirname, isEditable, join, languageFor, matchesAny, normalize, parsePatterns, previewKind } from './paths';

describe('paths', () => {
    it('normalises and joins', () => {
        expect(normalize('a//b/./c/../d')).toBe('/a/b/d');
        expect(join('/plugins', 'x.yml')).toBe('/plugins/x.yml');
        expect(dirname('/plugins/x.yml')).toBe('/plugins');
        expect(dirname('/x.yml')).toBe('/');
        expect(basename('/plugins/x.yml')).toBe('x.yml');
    });

    it('matches hidden and protected patterns like the backend', () => {
        const patterns = parsePatterns('# comment\n/config/secret.yml\n/world/\n*.log\nplugins/*.jar\n');
        expect(matchesAny('/config/secret.yml', patterns)).toBe(true);
        expect(matchesAny('/config/other.yml', patterns)).toBe(false);
        expect(matchesAny('/world/region/r.0.0.mca', patterns)).toBe(true);
        expect(matchesAny('/logs/latest.log', patterns)).toBe(true);
        expect(matchesAny('/plugins/Essentials.jar', patterns)).toBe(true);
        expect(matchesAny('/plugins/Essentials/config.yml', patterns)).toBe(false);
        // Deleting a folder that holds a protected file is refused too.
        expect(matchesAny('/config', patterns)).toBe(true);
        expect(matchesAny('/config', patterns, false)).toBe(false);
    });

    it('knows which files open in the editor', () => {
        expect(isEditable('server.properties', 'application/octet-stream')).toBe(true);
        expect(isEditable('paper.jar', 'application/java-archive')).toBe(false);
        expect(languageFor('config.yml')).toBe('yaml');
        expect(languageFor('server.properties')).toBe('ini');
        expect(previewKind('icon.png', 'image/png')).toBe('image');
        expect(previewKind('world.dat', 'application/octet-stream')).toBeNull();
    });
});
