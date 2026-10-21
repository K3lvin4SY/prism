import { useQuery } from '@tanstack/react-query';
import { useCurrentServerRequired, type SdkServer } from '@pterodactyl/sdk';
import { getInfo, keys, type Feature, type McInfo } from '../api/client';

/** Egg tags of other games: a server tagged only with these never asks the backend. */
const OTHER_GAMES = ['srcds', 'rust', 'garrysmod', 'fivem', 'voice'];

export function mightBeMinecraft(server: SdkServer | undefined): boolean {
    const tags = (server?.attributes.egg_tags ?? []).map((tag) => tag.toLowerCase());

    return tags.includes('minecraft') || tags.includes('bedrock') || !tags.some((tag) => OTHER_GAMES.includes(tag));
}

export function useMcInfoFor(server: SdkServer | undefined) {
    const identifier = server?.attributes.identifier ?? '';

    return useQuery({
        queryKey: keys.info(identifier),
        queryFn: () => getInfo(identifier),
        enabled: identifier !== '' && mightBeMinecraft(server),
        staleTime: 60_000,
        retry: 1,
    });
}

/** The detection result for the server page being viewed. */
export function useMcInfo() {
    const server = useCurrentServerRequired();
    const query = useMcInfoFor(server);

    return { server, identifier: server.attributes.identifier, info: query.data as McInfo | undefined, query };
}

/** Whether a tab shows for a server. Used by the screens' runtime visibility predicates. */
export function useFeatureVisible(server: SdkServer | undefined, feature: Feature): boolean {
    const { data } = useMcInfoFor(server);

    return data?.features[feature] === true;
}
