import { useQuery } from '@tanstack/react-query';
import { useCurrentServerRequired, type SdkServer } from '@pterodactyl/sdk';
import { getInfo, keys, type FactorioInfo, type Feature } from '../api/client';
import { eggTags } from '../config';

/**
 * Whether a server may run Factorio, before asking the backend: its egg has a detected tag, or
 * its startup runs bin/x64/factorio (the Factorio egg has no tag of its own).
 */
export function mightBeFactorio(server: SdkServer | undefined): boolean {
    if (!server) return false;
    const detected = eggTags();
    const tagged = (server.attributes.egg_tags ?? []).some((tag) => detected.includes(tag.toLowerCase()));

    return tagged || (server.attributes.invocation ?? '').includes('bin/x64/factorio');
}

export function useFactorioInfoFor(server: SdkServer | undefined) {
    const identifier = server?.attributes.identifier ?? '';

    return useQuery({
        queryKey: keys.info(identifier),
        queryFn: () => getInfo(identifier),
        enabled: identifier !== '' && mightBeFactorio(server),
        staleTime: 60_000,
        retry: 1,
    });
}

/** The detection result for the server page being viewed. */
export function useFactorioInfo() {
    const server = useCurrentServerRequired();
    const query = useFactorioInfoFor(server);

    return { server, identifier: server.attributes.identifier, info: query.data as FactorioInfo | undefined, query };
}

/** Whether a tab shows for a server. Used by the screens' runtime visibility predicates. */
export function useFeatureVisible(server: SdkServer | undefined, feature: Feature): boolean {
    const { data } = useFactorioInfoFor(server);

    return data?.features[feature] === true;
}
