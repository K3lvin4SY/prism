import { describe, expect, it } from 'vitest';
import { cssString, cssUrlToken, read } from './branding';

describe('read', () => {
    it('falls back to the defaults', () => {
        expect(read({})).toEqual({ logo: null, logoSquare: null, favicon: null, logoMode: 'instead', logoHeight: 32, loginMark: 'logo', loginLogoSize: 160 });
    });

    it('keeps sizes in range and ignores unknown modes', () => {
        const branding = read({ logo: '/extension-files/prism-branding/a.png', logo_mode: 'sideways', logo_height: 400, login_logo_size: '12', login_mark: 'none' });
        expect(branding).toMatchObject({ logo: '/extension-files/prism-branding/a.png', logoMode: 'instead', logoHeight: 64, loginLogoSize: 48, loginMark: 'none' });
    });
});

describe('css values', () => {
    it('escapes quotes, backslashes and new lines', () => {
        expect(cssString('Bob\'s "Hosting"\\\n')).toBe('"Bob\'s \\22 Hosting\\22 \\5c \\a "');
        expect(cssUrlToken('/extension-files/prism-branding/a.png')).toBe('url("/extension-files/prism-branding/a.png")');
    });
});
