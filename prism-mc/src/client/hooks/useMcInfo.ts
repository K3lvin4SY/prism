import { useQuery } from '@tanstack/react-query';
import { useCurrentServerRequired, type SdkServer } from '@pterodactyl/sdk';
import { getInfo, keys, type Feature, type McInfo } from '../api/client';

/** Prism MC only works on servers whose egg has the Minecraft tag. */
export function mightBeMinecraft(server: SdkServer | undefined): boolean {
    return (server?.attributes.egg_tags ?? []).some((tag) => tag.toLowerCase() === 'minecraft');
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
