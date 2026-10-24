import { useQuery } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';

/** Where a server's card picture comes from: its own, its egg's, or none (the panel's default or the pattern). */
export interface ServerPicture {
    url: string | null;
    source: 'server' | 'egg' | null;
    egg: string;
    canChange: boolean;
}

const CLIENT = '/api/client/extensions/prism-layout';
const server = (identifier: string) => `/api/client/servers/${identifier}/extensions/prism-layout/picture`;

export const pictureKeys = {
    servers: (uuids: readonly string[]) => ['prism-layout', 'pictures', uuids.join(',')] as const,
    server: (identifier: string) => ['prism-layout', 'picture', identifier] as const,
};

/** Each listed server's picture, by uuid; servers without one are left out. */
export function usePictures(uuids: readonly string[], enabled: boolean) {
    return useQuery({
        queryKey: pictureKeys.servers(uuids),
        queryFn: async () => (await http.get<{ data: Record<string, string> }>(`${CLIENT}/pictures`, { params: { servers: uuids.join(',') } })).data.data,
        enabled: enabled && uuids.length > 0,
        staleTime: 60_000,
    });
}

export const pictureApi = {
    get: async (identifier: string) => (await http.get<{ data: ServerPicture }>(server(identifier))).data.data,
    upload: async (identifier: string, file: File) => {
        const form = new FormData();
        form.append('file', file);

        return (await http.post<{ data: ServerPicture }>(server(identifier), form)).data.data;
    },
    remove: async (identifier: string) => (await http.delete<{ data: ServerPicture }>(server(identifier))).data.data,
};
