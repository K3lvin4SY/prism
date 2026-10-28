import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ServerContentBlock, Spinner, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { keys } from '../api/client';
import { categories, definitionsFor, getSettings, updateSettings, validate, type SettingsResponse } from '../api/settings';
import SaveBar, { describeValue } from '../components/SaveBar';
import SettingsBrowser from '../components/SettingsBrowser';
import { useFactorioInfo } from '../hooks/useFactorioInfo';

export default function PropertiesScreen() {
    const { identifier, info } = useFactorioInfo();
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: keys.properties(identifier), queryFn: () => getSettings(identifier) });

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

    const definitions = useMemo(() => definitionsFor(query.data?.kind ?? ''), [query.data?.kind]);
    const saved = query.data?.values ?? {};
    const current = (key: string) => saved[key] ?? String(definitions.find((definition) => definition.key === key)?.default ?? '');

    const change = (key: string, value: string) =>
        setDraft((now) => {
            const next = { ...now };
            if (value === current(key)) delete next[key];
            else next[key] = value;

            return next;
        });

    const changes = Object.entries(draft).map(([key, value]) => {
        const definition = definitions.find((item) => item.key === key);
        const options = definition?.options?.map((option) => ({ value: option, label: definition.optionLabels?.[option] ?? option }));

        const section = categories.find((entry) => entry.id === definition?.category)?.label;
        // A secret is never shown, not even the one being typed.
        if (definition?.type === 'secret') {
            return { key, label: definition.label, section, from: query.data?.secrets[key] ? 'saved' : 'not set', to: value === '' ? 'not set' : 'a new one' };
        }

        return { key, label: definition?.label ?? key, section, from: describeValue(current(key), options), to: describeValue(value, options) };
    });
    const problems = Object.entries(draft).flatMap(([key, value]) => {
        const definition = definitions.find((item) => item.key === key);
        const problem = definition ? validate(definition, value) : null;

        return problem ? [`${definition?.label ?? key}: ${problem}`] : [];
    });

    const save = async () => {
        setSaving(true);
        try {
            const changed = await updateSettings(identifier, draft);
            // A saved secret is not sent back; it shows as saved.
            const secrets = Object.fromEntries(definitions.filter((definition) => definition.type === 'secret' && draft[definition.key]).map((definition) => [definition.key, true]));
            queryClient.setQueryData<SettingsResponse>(keys.properties(identifier), (now) => (now ? { ...now, values: { ...now.values, ...draft, ...changed }, secrets: { ...now.secrets, ...secrets } } : now));
            setDraft({});
            toast.success('Saved. The changes take effect after the next restart.');
        } catch (exception) {
            toast.error(httpErrorToHuman(exception));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ServerContentBlock title={'Properties'}>
            {query.isLoading || !info ? (
                <Spinner centered />
            ) : query.isError || !query.data ? (
                <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>
            ) : !query.data.exists ? (
                <Alert type={'warning'}>data/server-settings.json is missing. The egg writes it when it installs, so reinstall the server from Settings.</Alert>
            ) : (
                <div className={'fct:flex fct:flex-col fct:gap-4'}>
                    <SettingsBrowser
                        kind={query.data.kind}
                        files={query.data.files}
                        values={query.data.values}
                        draft={draft}
                        onChange={change}
                        eggBindings={query.data.eggBindings}
                        secrets={query.data.secrets}
                    />
                    <SaveBar
                        changes={changes}
                        problems={problems}
                        saving={saving}
                        onSave={save}
                        onDiscard={() => setDraft({})}
                        onUndo={(key) =>
                            setDraft((now) => {
                                const { [key]: _undone, ...rest } = now;

                                return rest;
                            })
                        }
                    />
                </div>
            )}
        </ServerContentBlock>
    );
}
