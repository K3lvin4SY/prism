import { useQuery } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';
import { IconServer, IconVoice, type TablerIcon } from '@tabler/icons-react';
import garrysmod from './logos/garrysmod.png?inline';
import minecraft from './logos/minecraft.png?inline';
import rust from './logos/rust.png?inline';
import srcds from './logos/srcds.png?inline';
import terraria from './logos/terraria.png?inline';

/**
 * The logo for an egg tag when the egg has none of its own, the most specific tag first: a
 * Garry's Mod egg is also tagged srcds.
 */
const TAG_LOGOS: [string, string | TablerIcon][] = [
    ['garrysmod', garrysmod],
    ['rust', rust],
    ['terraria', terraria],
    ['minecraft', minecraft],
    ['srcds', srcds],
    ['voice', IconVoice],
];

export const logoKeys = {
    servers: (uuids: readonly string[]) => ['prism-layout', 'logos', uuids.join(',')] as const,
};

/** Each listed server's egg logo, by uuid; servers whose egg has none are left out. */
export function useLogos(uuids: readonly string[], enabled: boolean) {
    return useQuery({
        queryKey: logoKeys.servers(uuids),
        queryFn: async () => (await http.get<{ data: Record<string, string> }>('/api/client/extensions/prism-layout/logos', { params: { servers: uuids.join(',') } })).data.data,
        enabled: enabled && uuids.length > 0,
        staleTime: 60_000,
    });
}

/** The egg's own logo, else its tag's, else a server. */
export function GameLogo({ logo, tags }: { logo: string | null; tags: readonly string[] | undefined }) {
    const Source = logo ?? TAG_LOGOS.find(([tag]) => tags?.includes(tag))?.[1] ?? IconServer;

    // An image stands on its own; an icon sits on a tile like the color mark.
    return typeof Source === 'string' ? (
        <img src={Source} alt='' loading='lazy' aria-hidden className='pla:size-8 pla:shrink-0 pla:object-contain' />
    ) : (
        <span className='pla:flex pla:size-8 pla:shrink-0 pla:items-center pla:justify-center pla:rounded-md pla:bg-muted pla:text-muted-foreground' aria-hidden>
            <Source size={18} stroke={2} />
        </span>
    );
}
