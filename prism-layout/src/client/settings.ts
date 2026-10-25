import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { onDraft, readDraft } from './configStore';
import { http, notifyThemeChange, type ExtensionConfig } from '@pterodactyl/sdk';
import { gameTag } from './dashboard';

export type Bars = 'sidebar' | 'top' | 'dock' | 'sidebar_top' | 'rail' | 'rail_top' | 'top_dock';
export type GameMark = 'none' | 'color' | 'logo';

export type CardStyle = 'banner' | 'tile' | 'neon' | 'minimal' | 'compact' | 'outline' | 'rows';
export type LogoMode = 'beside' | 'instead' | 'name';
export type LoginStyle = 'card' | 'split' | 'backdrop';
export type LoginMark = 'logo' | 'mascot' | 'none';

/** The admin's Prism Layout settings, from Prism Properties; see PrismLayoutProvider for each. */
export interface LayoutSettings {
    enabled: boolean;
    bars: Bars;
    sidebar_width: number;
    dock_magnify: boolean;
    group_nav: boolean;
    server_card: boolean;
    scheme_switch: boolean;
    admin_styled: boolean;
    dashboard_panel: boolean;
    sidebar_collapse: boolean;
    brand_place: 'top' | 'sidebar';
    width: 'normal' | 'wide' | 'full';
    density: 'compact' | 'cozy' | 'comfortable';
    cards: CardStyle;
    status_style: 'badge' | 'dot' | 'bar';
    usage_style: 'bars' | 'numbers' | 'hidden';
    /** How cards show their game: not at all, by a color, or by a logo on Rows cards. */
    egg_colors: GameMark;
    power_buttons: boolean;
    card_image: string | null;
    logo: string | null;
    logo_mode: LogoMode;
    logo_height: number;
    logo_square: string | null;
    favicon: string | null;
    login_style: LoginStyle;
    login_mark: LoginMark;
    login_logo_size: number;
    login_tagline: string;
    login_image: string | null;
    announce_text: string;
    announce_level: 'info' | 'success' | 'warning' | 'danger';
    announce_style: 'bar' | 'card';
    announce_audience: 'everyone' | 'admins' | 'users';
    announce_link: string;
    announce_link_label: string;
    announce_from: string;
    announce_until: string;
    announce_dismiss: boolean;
    link1_label: string;
    link1_url: string;
    link2_label: string;
    link2_url: string;
    link3_label: string;
    link3_url: string;
    command_palette: boolean;
}

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const url = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const number = Number(value);

    return Number.isFinite(number) && value !== null && value !== '' ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

export function read(raw: Record<string, unknown>): LayoutSettings {
    return {
        enabled: bool(raw.enabled, true),
        bars: oneOf(raw.bars, ['sidebar', 'top', 'dock', 'sidebar_top', 'rail', 'rail_top', 'top_dock'] as const, 'sidebar'),
        sidebar_width: clamp(raw.sidebar_width, 12, 22, 16),
        dock_magnify: bool(raw.dock_magnify, true),
        group_nav: bool(raw.group_nav, true),
        server_card: bool(raw.server_card, true),
        scheme_switch: bool(raw.scheme_switch, true),
        admin_styled: bool(raw.admin_styled, true),
        dashboard_panel: bool(raw.dashboard_panel, true),
        sidebar_collapse: bool(raw.sidebar_collapse, true),
        brand_place: oneOf(raw.brand_place, ['top', 'sidebar'] as const, 'top'),
        width: oneOf(raw.width, ['normal', 'wide', 'full'] as const, 'normal'),
        density: oneOf(raw.density, ['compact', 'cozy', 'comfortable'] as const, 'cozy'),
        cards: oneOf(raw.cards, ['banner', 'tile', 'neon', 'minimal', 'compact', 'outline', 'rows'] as const, 'banner'),
        status_style: oneOf(raw.status_style, ['badge', 'dot', 'bar'] as const, 'badge'),
        usage_style: oneOf(raw.usage_style, ['bars', 'numbers', 'hidden'] as const, 'bars'),
        // Saved before it had three choices, it was on or off.
        egg_colors: typeof raw.egg_colors === 'boolean' ? (raw.egg_colors ? 'color' : 'none') : oneOf(raw.egg_colors, ['none', 'color', 'logo'] as const, 'color'),
        power_buttons: bool(raw.power_buttons, true),
        card_image: url(raw.card_image),
        logo: url(raw.logo),
        logo_mode: oneOf(raw.logo_mode, ['beside', 'instead', 'name'] as const, 'instead'),
        logo_height: clamp(raw.logo_height, 16, 64, 32),
        logo_square: url(raw.logo_square),
        favicon: url(raw.favicon),
        login_style: oneOf(raw.login_style, ['card', 'split', 'backdrop'] as const, 'card'),
        login_mark: oneOf(raw.login_mark, ['logo', 'mascot', 'none'] as const, 'logo'),
        login_logo_size: clamp(raw.login_logo_size, 48, 320, 160),
        login_tagline: text(raw.login_tagline),
        login_image: url(raw.login_image),
        announce_text: text(raw.announce_text),
        announce_level: oneOf(raw.announce_level, ['info', 'success', 'warning', 'danger'] as const, 'info'),
        announce_style: oneOf(raw.announce_style, ['bar', 'card'] as const, 'bar'),
        announce_audience: oneOf(raw.announce_audience, ['everyone', 'admins', 'users'] as const, 'everyone'),
        announce_link: text(raw.announce_link),
        announce_link_label: text(raw.announce_link_label, 'Read more'),
        announce_from: text(raw.announce_from),
        announce_until: text(raw.announce_until),
        announce_dismiss: bool(raw.announce_dismiss, true),
        link1_label: text(raw.link1_label),
        link1_url: text(raw.link1_url),
        link2_label: text(raw.link2_label),
        link2_url: text(raw.link2_url),
        link3_label: text(raw.link3_label),
        link3_url: text(raw.link3_url),
        command_palette: bool(raw.command_palette, true),
    };
}

/** Text as a quoted CSS string, escaped so it cannot end the string early. */
export const cssString = (value: string) => `"${value.replace(/["\\\n\r]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;

/** A value for a CSS `url()` token. */
export const cssUrlToken = (address: string) => `url(${cssString(address)})`;

/*
 * The saved settings, with the draft Prism Properties' preview window sends laid over them. Views
 * read them through useSettings(), so a preview shows at once.
 */
let saved: Record<string, unknown> = {};

/** In Prism Core's preview window, the draft being edited, laid over the saved settings. */
let draft: Record<string, unknown> = readDraft('prism-layout');
let current: LayoutSettings = read({});
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};

export const getSettings = () => current;

export function useSettings(): LayoutSettings {
    return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Whether nobody is signed in: the sign-in pages. */
const guest = () => !(window as unknown as { PterodactylUser?: unknown }).PterodactylUser;

/**
 * Writes the settings to `<html>` for the stylesheet: the logo tokens themes read, sizes, and
 * attributes for the page width, spacing, dock and sign-in page.
 */
export function apply(settings: LayoutSettings): void {
    current = settings;
    const root = document.documentElement;
    const set = (name: string, value: string | null) => (value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value));

    set('--brand-logo', settings.logo ? cssUrlToken(settings.logo) : null);
    set('--brand-logo-square', settings.logo_square ? cssUrlToken(settings.logo_square) : null);
    set('--pla-logo-height', `${settings.logo_height}px`);
    set('--pla-sidebar-width', `${settings.sidebar_width}rem`);
    set('--pla-card-image', settings.card_image ? cssUrlToken(settings.card_image) : null);
    set('--pla-login-size', `${settings.login_logo_size}px`);
    set('--pla-login-image', settings.login_image ? cssUrlToken(settings.login_image) : null);

    root.dataset.plaNav = settings.enabled ? 'on' : 'off';
    root.dataset.plaLogo = settings.logo ? settings.logo_mode : 'none';
    root.dataset.plaWidth = settings.width;
    root.dataset.plaDensity = settings.density;
    root.dataset.plaMagnify = String(settings.dock_magnify);
    // Without an uploaded logo the mascot stays unless the admin chose nothing at all.
    root.dataset.plaMark = settings.login_mark === 'logo' && !settings.logo ? 'mascot' : settings.login_mark;
    if (guest()) root.dataset.plaSignin = settings.login_style;
    else delete root.dataset.plaSignin;

    listeners.forEach((listener) => listener());
    notifyThemeChange();
}

export function setConfig(config: ExtensionConfig): void {
    saved = { ...(config as Record<string, unknown>) };
    apply(read({ ...saved, ...draft }));
}

/** Takes each draft Prism Core passes on in its preview window, and shows it at once. */
export function followPreview(): void {
    onDraft('prism-layout', (settings) => {
        draft = settings;
        apply(read({ ...saved, ...draft }));
    });
}

/**
 * A color for a game: the color its egg tag has on the panel's Tags page, or the gray the panel
 * gives a tag without one, so each game's cards look alike.
 */
export function eggColor(tags: readonly string[] | undefined, colors?: Readonly<Record<string, string>>): string | null {
    const tag = gameTag(tags);
    if (!tag) return null;

    return colors?.[tag] ?? 'var(--muted-foreground)';
}

/** The tag colors from the panel, loaded once and shared by every card and filter. */
export function useEggColor(): (tags: readonly string[] | undefined) => string | null {
    const colors = useQuery({
        queryKey: ['prism-layout', 'tag-colors'],
        queryFn: async () => (await http.get<{ data: Record<string, string> }>('/api/client/extensions/prism-layout/tags')).data.data,
        staleTime: 5 * 60_000,
    }).data;

    return useCallback((tags: readonly string[] | undefined) => eggColor(tags, colors), [colors]);
}
