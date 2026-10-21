import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, httpErrorToHuman, toast } from '@pterodactyl/sdk';

export interface Preferences {
    /** Whether this user is asked before a plugin or mod is installed. */
    confirmInstalls: boolean;
    confirmInstallsDefault: boolean;
    confirmInstallsChosen: boolean;
}

const url = '/api/client/extensions/mc-suite/preferences';
const key = ['mc-suite', 'preferences'] as const;

export function usePreferences() {
    return useQuery({ queryKey: key, queryFn: async () => (await http.get<Preferences>(url)).data, staleTime: 300_000 });
}

export function useSetConfirmInstalls() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (confirmInstalls: boolean | null) => (await http.put<Preferences>(url, { confirmInstalls })).data,
        onSuccess: (preferences) => queryClient.setQueryData(key, preferences),
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
}
