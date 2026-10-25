import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Spinner, TextArea, cn, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys } from '../api';
import { Section } from '../components/ui';
import { compile, decide } from '../patterns';

/** The server's .pteroignore, and a tester that says whether a path is backed up and why. */
export default function IgnoreTab() {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const canEdit = useServerPermission('file.update');
    const ignore = useQuery({ queryKey: keys.ignore(identifier), queryFn: () => api.readIgnore(identifier) });
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [path, setPath] = useState('logs/latest.log');
    const [folder, setFolder] = useState(false);

    useEffect(() => {
        if (ignore.data && draft === null) setDraft(ignore.data.content);
    }, [ignore.data, draft]);

    const text = draft ?? '';
    const rules = useMemo(() => compile(text), [text]);
    const decision = path.trim() ? decide(rules, path, folder) : null;
    const dirty = ignore.data !== undefined && text !== ignore.data.content;

    if (ignore.isLoading) return <Spinner centered />;
    if (ignore.isError) return <Alert type={'danger'}>{httpErrorToHuman(ignore.error)}</Alert>;

    const save = async () => {
        setSaving(true);
        try {
            await api.writeIgnore(identifier, text);
            await ignore.refetch();
            toast.success('.pteroignore saved.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={'pbk:grid pbk:gap-4 pbk:lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'}>
            <Section
                title={'.pteroignore'}
                actions={<span className={'pbk:text-xs pbk:text-muted-foreground'}>{ignore.data?.exists ? `${text.split('\n').length} lines` : 'not made yet'}</span>}
            >
                <div className={'pbk:flex pbk:flex-col pbk:gap-3'}>
                    <TextArea value={text} onChange={(event) => setDraft(event.target.value)} rows={16} spellCheck={false} readOnly={!canEdit} className={'pbk:w-full pbk:font-mono pbk:text-sm'} placeholder={'# One rule a line, like .gitignore\nlogs/\n*.log\ncache/'} />
                    {canEdit && (
                        <div className={'pbk:flex pbk:justify-end pbk:gap-2'}>
                            <Button.Text disabled={!dirty || saving} onClick={() => setDraft(ignore.data?.content ?? '')}>
                                Reset
                            </Button.Text>
                            <Button isLoading={saving} disabled={!dirty} onClick={save}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
            </Section>

            <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
                <Section title={'Test a path'}>
                    <div className={'pbk:flex pbk:flex-col pbk:gap-3'}>
                        <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder={'world/region/r.0.0.mca'} className={'pbk:font-mono'} aria-label={'Path to test'} />
                        <label className={'pbk:flex pbk:cursor-pointer pbk:items-center pbk:gap-2 pbk:text-sm'}>
                            <input type={'checkbox'} checked={folder} onChange={(event) => setFolder(event.target.checked)} style={{ accentColor: 'var(--primary)' }} /> It is a folder
                        </label>
                        {decision && (
                            <div className={cn('pbk:flex pbk:items-start pbk:gap-3 pbk:rounded-lg pbk:p-3', decision.ignored ? 'pbk:bg-destructive/10' : 'pbk:bg-green-500/10')}>
                                <NamedIcon name={decision.ignored ? 'circle-slash' : 'circle-check'} size={18} className={cn('pbk:mt-0.5 pbk:shrink-0', decision.ignored ? 'pbk:text-destructive' : 'pbk:text-green-500')} />
                                <div className={'pbk:min-w-0 pbk:text-sm'}>
                                    <p className={'pbk:font-semibold'}>{decision.ignored ? 'Skipped' : 'Backed up'}</p>
                                    <p className={'pbk:text-muted-foreground'}>
                                        {decision.rule ? (
                                            <>
                                                Line {decision.rule.line}, <code className={'pbk:font-mono'}>{decision.rule.text}</code>
                                                {decision.via ? `, matches the folder ${decision.via}` : ''}.
                                            </>
                                        ) : (
                                            'No line matches it.'
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </Section>

                <Section title={'When it applies'}>
                    <ul className={'pbk:flex pbk:list-disc pbk:flex-col pbk:gap-1.5 pbk:pl-4 pbk:text-sm pbk:text-muted-foreground'}>
                        <li>The node reads it for a backup made without a profile, or with a profile that includes it.</li>
                        <li>A server&apos;s default profile is used instead, unless the backup picks &ldquo;No profile&rdquo;.</li>
                        <li>Rules work like .gitignore: the last matching line wins, and ! takes a path back, though not out of a folder that is left out.</li>
                    </ul>
                </Section>
            </div>
        </div>
    );
}
