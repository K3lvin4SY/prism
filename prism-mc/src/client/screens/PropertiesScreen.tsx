import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ServerContentBlock, Spinner, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { categories, definitionsFor, getProperties, updateProperties, validate, type PropertiesResponse } from '../api/properties';
import SaveBar, { describeValue } from '../components/SaveBar';
import CrossplayPanel from '../components/CrossplayPanel';
import MotdEditor from '../components/MotdEditor';
import ProxyPanel from '../components/proxy/ProxyPanel';
import SettingsBrowser from '../components/SettingsBrowser';
import { useMcInfo } from '../hooks/useMcInfo';
import { featureEnabled } from '../config';

export default function PropertiesScreen() {
    const { identifier, info } = useMcInfo();
    const queryClient = useQueryClient();
    const isProxy = info?.kind === 'proxy';
    const query = useQuery({ queryKey: keys.properties(identifier), queryFn: () => getProperties(identifier), enabled: !isProxy });
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const dirty = Object.keys(draft).length > 0;

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const schema = query.data?.schema ?? query.data?.edition ?? info?.edition ?? 'java';
    const definitions = useMemo(() => definitionsFor(schema), [schema]);
    const saved = query.data?.values ?? {};
    const current = (key: string) => saved[key] ?? String(definitions.find((definition) => definition.key === key)?.default ?? '');

    const change = (key: string, value: string) =>
        setDraft((now) => {
            const next = { ...now };
            if (value === current(key)) delete next[key];
            else next[key] = value;

            return next;
        });

    const save = async (values: Record<string, string>) => {
        const changed = await updateProperties(identifier, values);
        queryClient.setQueryData<PropertiesResponse>(keys.properties(identifier), (current) =>
            current ? { ...current, values: { ...current.values, ...values, ...changed } } : current
        );
    };

    const refresh = () => queryClient.invalidateQueries({ queryKey: keys.properties(identifier) });

    const changes = Object.entries(draft).map(([key, value]) => {
        const definition = definitions.find((item) => item.key === key);
        const options = definition?.options?.map((option) => ({ value: option, label: definition.optionLabels?.[option] ?? option }));

        return { key, label: definition?.label ?? key, section: categories.find((entry) => entry.id === definition?.category)?.label, from: describeValue(current(key), options), to: describeValue(value, options) };
    });
    const problems = Object.entries(draft).flatMap(([key, value]) => {
        const definition = definitions.find((item) => item.key === key);
        const problem = definition ? validate(definition, value) : null;

        return problem ? [`${definition?.label ?? key}: ${problem}`] : [];
    });

    const saveDraft = async () => {
        setSaving(true);
        try {
            await save(draft);
            setDraft({});
            toast.success('Saved. The changes take effect after the next restart.');
        } catch (exception) {
            toast.error(httpErrorToHuman(exception));
        } finally {
            setSaving(false);
        }
    };

    // A proxy has no server.properties; its page is the network it fronts.
    if (isProxy) {
        return (
            <ServerContentBlock title={'Properties'}>
                {featureEnabled('proxy') && <ProxyPanel server={identifier} />}
            </ServerContentBlock>
        );
    }

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
                        This server has no {data.file} yet. Start it once to create the file, or set values here and they will be written to a new file.
                    </Alert>
                )}

                <SettingsBrowser
                    edition={data.schema ?? edition}
                    file={data.file}
                    values={data.values}
                    draft={draft}
                    onChange={change}
                    eggBindings={data.eggBindings}
                    panels={edition === 'java' ? { ...(featureEnabled('crossplay') ? { crossplay: <CrossplayPanel server={identifier} /> } : {}), ...(featureEnabled('proxy') ? { proxy: <ProxyPanel server={identifier} /> } : {}) } : {}}
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

                <SaveBar
                    changes={changes}
                    problems={problems}
                    saving={saving}
                    onSave={saveDraft}
                    onDiscard={() => setDraft({})}
                    onUndo={(key) =>
                        setDraft((now) => {
                            const { [key]: _undone, ...rest } = now;

                            return rest;
                        })
                    }
                />
            </div>
        </ServerContentBlock>
    );
}
