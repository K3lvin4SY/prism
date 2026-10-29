import { useQuery } from '@tanstack/react-query';
import { cn, http } from '@pterodactyl/sdk';
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

export const gameKeys = {
    servers: (uuids: readonly string[]) => ['prism-layout', 'games', uuids.join(',')] as const,
};

/** A server's game: its egg's name, and the egg's own logo when it has one. */
export interface Game {
    game: string | null;
    logo: string | null;
}

/** Each listed server's game, by uuid. */
export function useGames(uuids: readonly string[], enabled = true) {
    return useQuery({
        queryKey: gameKeys.servers(uuids),
        queryFn: async () => (await http.get<{ data: Record<string, Game> }>('/api/client/extensions/prism-layout/games', { params: { servers: uuids.join(',') } })).data.data,
        enabled: enabled && uuids.length > 0,
        staleTime: 60_000,
    });
}

/** The egg's own logo, else its tag's, else a server; `size` in pixels. */
export function GameLogo({ logo, tags, size = 32, className }: { logo: string | null; tags: readonly string[] | undefined; size?: number; className?: string }) {
    const Source = logo ?? TAG_LOGOS.find(([tag]) => tags?.includes(tag))?.[1] ?? IconServer;
    const box = { width: size, height: size };

    // An image stands on its own; an icon sits on a tile like the color mark.
    return typeof Source === 'string' ? (
        <img src={Source} alt='' loading='lazy' aria-hidden style={box} className={cn('pla:shrink-0 pla:rounded-md pla:object-contain', className)} />
    ) : (
        <span style={box} className={cn('pla:flex pla:shrink-0 pla:items-center pla:justify-center pla:rounded-md pla:bg-muted pla:text-muted-foreground', className)} aria-hidden>
            <Source size={Math.round(size * 0.56)} stroke={2} />
        </span>
    );
}
