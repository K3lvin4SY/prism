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

/** The provider's Tabler brand icon, or null for an OpenID Connect provider without one. */
export function brandFor(provider: Pick<PublicProvider, 'type' | 'name'>): string | null {
    return MARKS[provider.type] ?? BY_NAME.find(([pattern]) => pattern.test(provider.name))?.[1] ?? null;
}

export function markFor(provider: Pick<PublicProvider, 'type' | 'name'>): string {
    return brandFor(provider) ?? 'shield';
}

/** A provider's own picture when it has one set, else its brand mark. */
export default function ProviderMark({ provider, size = 20 }: { provider: Pick<PublicProvider, 'type' | 'name' | 'icon'>; size?: number }) {
    if (provider.icon) return <img src={provider.icon} alt={''} width={size} height={size} className={'pau:shrink-0 pau:rounded-sm pau:object-contain'} />;

    return <NamedIcon name={markFor(provider)} size={size} className={'pau:shrink-0'} />;
}

/** The mark on a tile: a brand (or the provider's own picture) on white, any other provider a shield. */
export function ProviderTile({ provider, size = 40 }: { provider: Pick<PublicProvider, 'type' | 'name' | 'icon'>; size?: number }) {
    const icon = Math.round(size * 0.5);
    const branded = !!provider.icon || brandFor(provider) !== null;

    return (
        <span
            style={{ width: size, height: size }}
            className={
                branded
                    ? 'pau:flex pau:shrink-0 pau:items-center pau:justify-center pau:overflow-hidden pau:rounded-lg pau:bg-white pau:text-neutral-900 pau:shadow-sm'
                    : 'pau:flex pau:shrink-0 pau:items-center pau:justify-center pau:rounded-lg pau:border pau:border-border pau:bg-muted/40 pau:text-primary'
            }
        >
            <ProviderMark provider={provider} size={icon} />
        </span>
    );
}
