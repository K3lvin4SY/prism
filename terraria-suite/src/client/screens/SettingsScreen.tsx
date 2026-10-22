import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ServerContentBlock, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getSettings, updateSettings, type SettingsResponse } from '../api/settings';
import SettingsBrowser from '../components/SettingsBrowser';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

/** Where infection spread is controlled, for the servers that have no switch for it. */
const SPREAD_NOTE = (
    <Alert type={'info'}>
        Only TShock can stop the Corruption, Crimson and Hallow from spreading. On this server it is the Journey mode power &ldquo;Freeze infection spread&rdquo;: choose
        below who may use it. In other game modes it cannot be turned off.
    </Alert>
);

export default function SettingsScreen() {
    const { identifier, info } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: keys.settings(identifier), queryFn: () => getSettings(identifier) });

    const save = async (values: Record<string, string>) => {
        const changed = await updateSettings(identifier, values);
        queryClient.setQueryData<SettingsResponse>(keys.settings(identifier), (current) =>
            current ? { ...current, values: { ...current.values, ...values, ...changed } } : current
        );
    };

    return (
        <ServerContentBlock title={'Settings'}>
            {query.isLoading || !info ? (
                <Spinner centered />
            ) : query.isError || !query.data ? (
                <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
            ) : !query.data.exists ? (
                <Alert type={'info'}>Start the server once so TShock writes its config files. Its settings can be changed here after that.</Alert>
            ) : (
                <SettingsBrowser
                    kind={query.data.kind}
                    files={query.data.files}
                    values={query.data.values}
                    onSave={save}
                    eggBindings={query.data.eggBindings}
                    notes={info.kind === 'tshock' ? {} : { journey: SPREAD_NOTE }}
                />
            )}
        </ServerContentBlock>
    );
}
