import { notifyThemeChange, type ExtensionConfig } from '@pterodactyl/sdk';

export type LogoMode = 'beside' | 'instead' | 'name';
export type LoginMark = 'logo' | 'mascot' | 'none';

/** The admin's Prism Branding settings, from Prism Properties. */
export interface Branding {
    logo: string | null;
    logoSquare: string | null;
    favicon: string | null;
    logoMode: LogoMode;
    logoHeight: number;
    loginMark: LoginMark;
    loginLogoSize: number;
}

const url = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);

export function read(raw: ExtensionConfig): Branding {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return {
        logo: url(get('logo')),
        logoSquare: url(get('logo_square')),
        favicon: url(get('favicon')),
        logoMode: oneOf(get('logo_mode'), ['beside', 'instead', 'name'] as const, 'instead'),
        logoHeight: clamp(get('logo_height'), 16, 64, 32),
        loginMark: oneOf(get('login_mark'), ['logo', 'mascot', 'none'] as const, 'logo'),
        loginLogoSize: clamp(get('login_logo_size'), 48, 320, 160),
    };
}

let branding: Branding = read({});

export const getBranding = () => branding;

/** Text as a quoted CSS string, escaped so it cannot end the string early. */
export const cssString = (text: string) => `"${text.replace(/["\\\n\r]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;

/** A value for a CSS `url()` token. */
export const cssUrlToken = (address: string) => `url(${cssString(address)})`;

/**
 * Puts the branding on `<html>`, for every page including the sign-in pages: the logo tokens
 * themes read (`--brand-logo`, and `--brand-logo-square` for icon-only places), the sizes, and
 * attributes the stylesheet keys on.
 */
export function apply(next: Branding): void {
    branding = next;
    const root = document.documentElement;
    const set = (name: string, value: string | null) => (value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value));

    set('--brand-logo', next.logo ? cssUrlToken(next.logo) : null);
    set('--brand-logo-square', next.logoSquare ? cssUrlToken(next.logoSquare) : null);
    set('--pbr-logo-height', `${next.logoHeight}px`);
    set('--pbr-login-size', `${next.loginLogoSize}px`);
    root.dataset.pbrLogo = next.logo ? next.logoMode : 'none';
    // Without an uploaded logo the mascot stays unless the admin chose nothing at all.
    root.dataset.pbrLogin = next.loginMark === 'logo' && !next.logo ? 'mascot' : next.loginMark;

    notifyThemeChange();
}
