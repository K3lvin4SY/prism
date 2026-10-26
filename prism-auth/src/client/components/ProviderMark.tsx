import type { PublicProvider } from '../api';
import { NamedIcon } from '../icons';

const MARKS: Record<string, string> = {
    google: 'brand-google',
    discord: 'brand-discord',
    github: 'brand-github',
    steam: 'brand-steam',
};

/** Icons for the OpenID Connect presets, by a word in the provider's name. */
const BY_NAME: [RegExp, string][] = [
    [/entra|microsoft|azure/i, 'brand-windows'],
    [/gitlab/i, 'brand-gitlab'],
    [/auth0/i, 'brand-auth0'],
];

export function markFor(provider: Pick<PublicProvider, 'type' | 'name'>): string {
    return MARKS[provider.type] ?? BY_NAME.find(([pattern]) => pattern.test(provider.name))?.[1] ?? 'key-round';
}

/** A provider's own picture when it has one set, else its brand mark. */
export default function ProviderMark({ provider, size = 20 }: { provider: Pick<PublicProvider, 'type' | 'name' | 'icon'>; size?: number }) {
    if (provider.icon) return <img src={provider.icon} alt={''} width={size} height={size} className={'pau:shrink-0 pau:rounded-sm pau:object-contain'} />;

    return <NamedIcon name={markFor(provider)} size={size} className={'pau:shrink-0'} />;
}
