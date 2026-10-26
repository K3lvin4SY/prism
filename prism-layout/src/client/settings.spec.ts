import { afterEach, describe, expect, it } from 'vitest';
import { apply, barsFor, cssString, cssUrlToken, getSettings, read, type Device } from './settings';

describe('read', () => {
    it('falls back to the defaults', () => {
        expect(read({})).toMatchObject({ dashboard_panel: true, sidebar_collapse: true, brand_place: 'sidebar' });
        expect(read({ brand_place: 'left' }).brand_place).toBe('sidebar');
        expect(read({})).toMatchObject({ enabled: true, bars: 'sidebar_top', sidebar_width: 14, width: 'normal', cards: 'rows', logo: null, logo_mode: 'name', logo_height: 32, login_style: 'backdrop', login_mark: 'logo', login_logo_size: 160 });
    });

    it('keeps sizes in range and ignores unknown options', () => {
        const settings = read({ logo: '/extension-files/prism-layout/a.png', logo_mode: 'sideways', logo_height: 400, login_logo_size: '12', login_mark: 'none', bars: 'floating', sidebar_width: 30 });
        expect(settings).toMatchObject({ logo: '/extension-files/prism-layout/a.png', logo_mode: 'name', logo_height: 64, login_logo_size: 48, login_mark: 'none', bars: 'sidebar_top', sidebar_width: 22 });
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

describe('navigation per device', () => {
    it('follows the next size up until a device has its own', () => {
        const settings = read({ bars: 'sidebar_top' });
        expect(['desktop', 'tablet', 'mobile'].map((device) => barsFor(settings, device as Device))).toEqual(['sidebar_top', 'sidebar_top', 'sidebar_top']);
    });

    it('lets tablets and phones choose their own', () => {
        const settings = read({ bars: 'sidebar_top', bars_tablet: 'top_dock', bars_mobile: 'sidebar' });
        expect(['desktop', 'tablet', 'mobile'].map((device) => barsFor(settings, device as Device))).toEqual(['sidebar_top', 'top_dock', 'sidebar']);
    });

    it('gives phones the tablet choice when they have none, and reads the expandable dock', () => {
        const settings = read({ bars: 'top', bars_tablet: 'dock_expand' });
        expect(barsFor(settings, 'mobile')).toBe('dock_expand');
        expect(read({ bars: 'nonsense', bars_mobile: 'nonsense' })).toMatchObject({ bars: 'sidebar_top', bars_mobile: 'same' });
    });
});
