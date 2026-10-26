import type { ExtensionConfig } from '@pterodactyl/sdk';
import { createConfigStore } from './configStore';

/** Prism Auth's settings the sign-in page may know, from Prism Properties. */
export interface AuthConfig {
    buttonStyle: 'rows' | 'icons';
    dividerText: string;
    autoCreate: boolean;
    signup: {
        enabled: boolean;
        username: 'choose' | 'generate';
        names: boolean;
        terms: string;
        botTrap: boolean;
        turnstile: string;
    };
    password: { min: number; mixed: boolean; number: boolean };
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

export function read(raw: ExtensionConfig): AuthConfig {
    const get = (key: string) => (raw as Record<string, unknown>)[key];

    return {
        buttonStyle: get('button_style') === 'icons' ? 'icons' : 'rows',
        dividerText: str(get('divider_text'), 'Or continue with'),
        autoCreate: bool(get('auto_create'), false),
        signup: {
            enabled: bool(get('signup_enabled'), false),
            username: get('signup_username') === 'generate' ? 'generate' : 'choose',
            names: bool(get('signup_names'), true),
            terms: str(get('terms_url'), '').trim(),
            botTrap: bool(get('bot_trap'), true),
            turnstile: str(get('turnstile_site_key'), '').trim(),
        },
        password: {
            min: Math.max(8, Number(get('password_min')) || 8),
            mixed: bool(get('password_mixed'), false),
            number: bool(get('password_number'), false),
        },
    };
}

/** The settings, with Prism Core's live preview draft over them in its preview window. */
export const configStore = createConfigStore('prism-auth', read);

export function setConfig(raw: ExtensionConfig): void {
    configStore.set(raw);
}

export function getConfig(): AuthConfig {
    return configStore.get();
}
