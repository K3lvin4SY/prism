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

    it('reads the card styles from before rows and tiles', () => {
        expect(read({})).toMatchObject({ cards: 'rows', card_banner: false });
        expect(read({ cards: 'tile' })).toMatchObject({ cards: 'tile', card_banner: false });
        expect(read({ cards: 'banner' })).toMatchObject({ cards: 'tile', card_banner: true });
        expect(read({ cards: 'banner', card_banner: false })).toMatchObject({ cards: 'tile', card_banner: false });
        for (const old of ['neon', 'minimal', 'compact', 'outline']) expect(read({ cards: old })).toMatchObject({ cards: 'tile', card_banner: false });
        expect(read({ cards: 'carousel' }).cards).toBe('rows');
    });

    it('takes the old sign-in tagline as the headline', () => {
        expect(read({ login_tagline: 'Play together' })).toMatchObject({ login_title: 'Play together', login_subtitle: '' });
        expect(read({ login_tagline: 'Old', login_title: 'New', login_subtitle: 'More' })).toMatchObject({ login_title: 'New', login_subtitle: 'More' });
    });

    it('reads the announcement badge and link text', () => {
        expect(read({})).toMatchObject({ announce_badge: '', announce_link_label: 'Details' });
        expect(read({ announce_badge: 'Maintenance' }).announce_badge).toBe('Maintenance');
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
    it('gives tablets the top bar and dock and phones the expandable dock by default', () => {
        const settings = read({ bars: 'sidebar_top' });
        expect(['desktop', 'tablet', 'mobile'].map((device) => barsFor(settings, device as Device))).toEqual(['sidebar_top', 'top_dock', 'dock_expand']);
    });

    it('reads a saved same as the navigation it followed', () => {
        const settings = read({ bars: 'sidebar_top', bars_tablet: 'same', bars_mobile: 'same' });
        expect(['desktop', 'tablet', 'mobile'].map((device) => barsFor(settings, device as Device))).toEqual(['sidebar_top', 'sidebar_top', 'sidebar_top']);
    });

    it('lets tablets and phones choose their own', () => {
        const settings = read({ bars: 'sidebar_top', bars_tablet: 'top_dock', bars_mobile: 'sidebar' });
        expect(['desktop', 'tablet', 'mobile'].map((device) => barsFor(settings, device as Device))).toEqual(['sidebar_top', 'top_dock', 'sidebar']);
    });

    it('reads a phone set to same as the tablet choice, and falls back to the defaults', () => {
        const settings = read({ bars: 'top', bars_tablet: 'rail', bars_mobile: 'same' });
        expect(barsFor(settings, 'mobile')).toBe('rail');
        expect(read({ bars: 'nonsense', bars_tablet: 'nonsense', bars_mobile: 'nonsense' })).toMatchObject({ bars: 'sidebar_top', bars_tablet: 'top_dock', bars_mobile: 'dock_expand' });
    });

    it('takes a palette shortcut useShortcut can follow', () => {
        expect(read({}).palette_shortcut).toBe('mod+k');
        expect(read({ palette_shortcut: 'mod+p' }).palette_shortcut).toBe('mod+p');
        expect(read({ palette_shortcut: '/' }).palette_shortcut).toBe('/');
        expect(read({ palette_shortcut: 'mod+f2' }).palette_shortcut).toBe('mod+f2');
        expect(read({ palette_shortcut: 'ctrl+shift+k' }).palette_shortcut).toBe('mod+k');
    });
});
