import { useQuery } from '@tanstack/react-query';
import { useCurrentServerRequired, type SdkServer } from '@pterodactyl/sdk';
import { getInfo, keys, type CoreKeeperInfo, type Feature } from '../api/client';
import { eggTags } from '../config';

/**
 * Whether a server may run Core Keeper, before asking the backend: its egg has a detected tag,
 * or its startup runs CoreKeeperServer (the Core Keeper egg has no tag of its own).
 */
export function mightBeCoreKeeper(server: SdkServer | undefined): boolean {
    if (!server) return false;
    const detected = eggTags();
    const tagged = (server.attributes.egg_tags ?? []).some((tag) => detected.includes(tag.toLowerCase()));

    return tagged || (server.attributes.invocation ?? '').includes('CoreKeeperServer');
}

export function useCoreKeeperInfoFor(server: SdkServer | undefined) {
    const identifier = server?.attributes.identifier ?? '';

    return useQuery({
        queryKey: keys.info(identifier),
        queryFn: () => getInfo(identifier),
        enabled: identifier !== '' && mightBeCoreKeeper(server),
        staleTime: 60_000,
        retry: 1,
    });
}

/** The detection result for the server page being viewed. */
export function useCoreKeeperInfo() {
    const server = useCurrentServerRequired();
    const query = useCoreKeeperInfoFor(server);

    return { server, identifier: server.attributes.identifier, info: query.data as CoreKeeperInfo | undefined, query };
}

/** Whether a tab shows for a server. Used by the screens' runtime visibility predicates. */
export function useFeatureVisible(server: SdkServer | undefined, feature: Feature): boolean {
    const { data } = useCoreKeeperInfoFor(server);

    return data?.features[feature] === true;
}
