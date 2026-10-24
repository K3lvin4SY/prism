import { afterEach, describe, expect, it } from 'vitest';
import { apply, cssString, cssUrlToken, getSettings, read } from './settings';

describe('read', () => {
    it('falls back to the defaults', () => {
        expect(read({})).toMatchObject({ dashboard_panel: true, sidebar_collapse: true, brand_place: 'top' });
        expect(read({ brand_place: 'left' }).brand_place).toBe('top');
        expect(read({})).toMatchObject({ enabled: true, bars: 'sidebar', sidebar_width: 16, width: 'normal', cards: 'banner', logo: null, logo_mode: 'instead', logo_height: 32, login_style: 'card', login_mark: 'logo', login_logo_size: 160 });
    });

    it('keeps sizes in range and ignores unknown options', () => {
        const settings = read({ logo: '/extension-files/prism-layout/a.png', logo_mode: 'sideways', logo_height: 400, login_logo_size: '12', login_mark: 'none', bars: 'floating', sidebar_width: 30 });
        expect(settings).toMatchObject({ logo: '/extension-files/prism-layout/a.png', logo_mode: 'instead', logo_height: 64, login_logo_size: 48, login_mark: 'none', bars: 'sidebar', sidebar_width: 22 });
    });
});

describe('css values', () => {
    it('escapes quotes, backslashes and new lines', () => {
        expect(cssString('Bob\'s "Hosting"\\\n')).toBe('"Bob\'s \\22 Hosting\\22 \\5c \\a "');
        expect(cssUrlToken('/extension-files/prism-layout/a.png')).toBe('url("/extension-files/prism-layout/a.png")');
    });
});

describe('apply', () => {
    const root = document.documentElement;

    afterEach(() => {
        delete (window as unknown as { PterodactylUser?: unknown }).PterodactylUser;
        apply(read({}));
    });

    it('writes the tokens and attributes the stylesheet reads', () => {
        apply(read({ logo: '/a.png', logo_mode: 'beside', width: 'wide', density: 'compact', sidebar_width: 14, login_style: 'split' }));

        expect(root.style.getPropertyValue('--brand-logo')).toBe('url("/a.png")');
        expect(root.style.getPropertyValue('--pla-sidebar-width')).toBe('14rem');
        expect(root.dataset).toMatchObject({ plaNav: 'on', plaLogo: 'beside', plaWidth: 'wide', plaDensity: 'compact', plaMark: 'logo', plaSignin: 'split' });
        expect(getSettings().width).toBe('wide');
    });

    it('keeps the mascot when no logo is uploaded', () => {
        apply(read({ login_mark: 'logo' }));
        expect(root.dataset.plaMark).toBe('mascot');
        expect(root.dataset.plaLogo).toBe('none');
        expect(root.style.getPropertyValue('--brand-logo')).toBe('');
    });

    it('only styles the sign-in page while nobody is signed in', () => {
        (window as unknown as { PterodactylUser?: unknown }).PterodactylUser = { uuid: 'x' };
        apply(read({ login_style: 'backdrop' }));
        expect(root.dataset.plaSignin).toBeUndefined();
    });
});
