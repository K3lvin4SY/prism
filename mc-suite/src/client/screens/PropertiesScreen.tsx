import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ServerContentBlock, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { getProperties, updateProperties, type PropertiesResponse } from '../api/properties';
import MotdEditor from '../components/MotdEditor';
import SettingsBrowser from '../components/SettingsBrowser';
import { useMcInfo } from '../hooks/useMcInfo';

export default function PropertiesScreen() {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: keys.properties(identifier), queryFn: () => getProperties(identifier) });

    const save = async (values: Record<string, string>) => {
        const changed = await updateProperties(identifier, values);
        queryClient.setQueryData<PropertiesResponse>(keys.properties(identifier), (current) =>
            current ? { ...current, values: { ...current.values, ...values, ...changed } } : current
        );
    };

    const refresh = () => queryClient.invalidateQueries({ queryKey: keys.properties(identifier) });

    if (query.isLoading) {
        return (
            <ServerContentBlock title={'Properties'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (query.isError || !query.data) {
        return (
            <ServerContentBlock title={'Properties'}>
                <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const data = query.data;
    const edition = data.edition ?? info?.edition ?? 'java';

    return (
        <ServerContentBlock title={'Properties'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {!data.exists && (
                    <Alert type={'info'}>
                        This server has no server.properties yet. Start it once to create the file, or set values here and they will be written to a new file.
                    </Alert>
                )}

                <SettingsBrowser
                    edition={edition}
                    values={data.values}
                    onSave={save}
                    eggBindings={data.eggBindings}
                    motdEditor={
                        edition === 'java' ? (
                            <MotdEditor
                                server={identifier}
                                software={data.software}
                                motd={data.values.motd ?? 'A Minecraft Server'}
                                icon={data.icon}
                                serverName={data.serverName}
                                canRename={data.canRename}
                                maxPlayers={Number(data.values['max-players'] ?? 20)}
                                onSave={save}
                                onIconChange={refresh}
                            />
                        ) : undefined
                    }
                />
            </div>
        </ServerContentBlock>
    );
}
