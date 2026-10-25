import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Switch, TextArea, cn, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, type Profile, type ProfileMode } from '../api';
import ServerTree from '../components/ServerTree';
import { Pills, Section } from '../components/ui';
import { getConfig } from '../config';
import { lines, profileLines } from '../patterns';
import { GAMES, PRESETS } from '../presets';

/** A path line the tree can tick: no wildcards and no "!". */
const plain = (line: string) => !/[*?[\]!#]/.test(line);
const clean = (line: string) => line.trim().replace(/^\/+|\/+$/g, '');

export default function ProfileEditor({ profile, profiles, onDone }: { profile: Profile | null; profiles: Profile[]; onDone: () => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const config = getConfig();
    const [name, setName] = useState(profile?.name ?? '');
    const [mode, setMode] = useState<ProfileMode>(profile?.mode ?? 'exclude');
    const [patterns, setPatterns] = useState(profile?.patterns ?? '');
    const [applyPteroignore, setApplyPteroignore] = useState(profile?.applyPteroignore ?? false);
    const [lockBackups, setLockBackups] = useState(profile?.lockBackups ?? false);
    const [isDefault, setIsDefault] = useState(profile?.isDefault ?? profiles.length === 0);
    const [game, setGame] = useState<(typeof GAMES)[number]>('All');
    const [saving, setSaving] = useState(false);
    const ignore = useQuery({ queryKey: keys.ignore(identifier), queryFn: () => api.readIgnore(identifier), enabled: config.pteroignore && applyPteroignore && mode === 'exclude', retry: false });

    const current = lines(patterns);
    const ticked = new Set(current.filter(plain).map(clean).filter(Boolean));
    const result = profileLines(mode, patterns, ignore.data?.content ?? null, applyPteroignore);
    const taken = profiles.some((other) => other.id !== profile?.id && other.name.toLowerCase() === name.trim().toLowerCase());

    const toggle = (path: string, directory: boolean, on: boolean) => {
        // Picks inside the path are covered by it now.
        const kept = current.filter((line) => !(plain(line) && (clean(line) === path || clean(line).startsWith(`${path}/`))));
        if (on) kept.push(mode === 'include' ? path : `/${path}${directory ? '/' : ''}`);
        setPatterns(kept.join('\n'));
    };

    const switchMode = (next: ProfileMode) => {
        if (next === mode) return;
        // Ticked paths carry over; patterns with wildcards mean something else in the other mode.
        setPatterns(current.filter(plain).map((line) => (next === 'include' ? clean(line) : `/${clean(line)}`)).join('\n'));
        setMode(next);
    };

    const save = async () => {
        setSaving(true);
        const input = { name: name.trim(), mode, patterns, applyPteroignore: mode === 'exclude' && applyPteroignore, lockBackups, isDefault };
        try {
            profile ? await api.updateProfile(identifier, profile.id, input) : await api.createProfile(identifier, input);
            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
            toast.success(profile ? 'Profile saved.' : 'Profile created.');
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3'}>
                <Button isSecondary size={'small'} onClick={onDone}>
                    <NamedIcon name={'arrow-left'} size={14} /> All profiles
                </Button>
                <h2 className={'pbk:flex-1 pbk:text-lg pbk:font-semibold'}>{profile ? `Edit ${profile.name}` : 'New profile'}</h2>
            </div>

            <Section title={'Profile'}>
                <div className={'pbk:grid pbk:gap-4 pbk:md:grid-cols-2'}>
                    <label className={'pbk:flex pbk:flex-col pbk:gap-1 pbk:text-sm'}>
                        Name
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={'World only'} maxLength={64} $hasError={taken} />
                        {taken && <span className={'pbk:text-xs pbk:text-destructive'}>Another profile has this name.</span>}
                    </label>
                    <div className={'pbk:flex pbk:flex-col pbk:gap-1 pbk:text-sm'}>
                        What it backs up
                        <Pills
                            value={mode}
                            onChange={switchMode}
                            options={[
                                { value: 'exclude', label: 'Everything except' },
                                { value: 'include', label: 'Only what I pick' },
                            ]}
                        />
                    </div>
                    <Switch checked={isDefault} onChange={setIsDefault} label={'Default profile'} description={'Used for every backup that names no profile, schedule tasks included.'} />
                    <Switch checked={lockBackups} onChange={setLockBackups} label={'Lock backups made with it'} description={'They are never deleted or replaced until unlocked.'} />
                    {mode === 'exclude' && config.pteroignore && <Switch checked={applyPteroignore} onChange={setApplyPteroignore} label={'Include the .pteroignore'} description={'Leave out what the server\'s .pteroignore lists, as well.'} />}
                </div>
            </Section>

            <div className={'pbk:grid pbk:gap-4 pbk:lg:grid-cols-2'}>
                <Section title={mode === 'include' ? 'Tick what to back up' : 'Tick what to leave out'}>
                    <ServerTree ticked={ticked} onToggle={toggle} />
                </Section>
                <Section title={mode === 'include' ? 'Picked paths' : 'Patterns'} actions={<span className={'pbk:text-xs pbk:text-muted-foreground'}>{current.length} lines</span>}>
                    <div className={'pbk:flex pbk:flex-col pbk:gap-3'}>
                        <TextArea value={patterns} onChange={(event) => setPatterns(event.target.value)} rows={10} spellCheck={false} className={'pbk:w-full pbk:font-mono pbk:text-sm'} placeholder={mode === 'include' ? 'world\nplugins/LuckPerms\nserver.properties' : 'logs/\n*.log\ncache/'} />
                        <p className={'pbk:text-xs pbk:text-muted-foreground'}>
                            {mode === 'include' ? 'One file or folder a line, from the server\'s top folder.' : 'Gitignore rules, one a line: logs/ is a folder anywhere, /logs only the top one, *.log any file ending in .log, and ! takes something back.'}
                        </p>
                        <div className={'pbk:flex pbk:flex-col pbk:gap-2'}>
                            <span className={'pbk:text-xs pbk:font-semibold pbk:uppercase pbk:tracking-wide pbk:text-muted-foreground'}>Presets</span>
                            <Pills size={'sm'} value={game} onChange={setGame} options={GAMES.map((item) => ({ value: item, label: item }))} />
                            <div className={'pbk:flex pbk:flex-wrap pbk:gap-2'}>
                                {PRESETS.filter((preset) => game === 'All' || preset.game === game).map((preset) => (
                                    <button
                                        key={`${preset.game}-${preset.name}`}
                                        type={'button'}
                                        title={preset.description}
                                        onClick={() => {
                                            setMode(preset.mode);
                                            setPatterns(preset.patterns.join('\n'));
                                            if (!name.trim()) setName(preset.name);
                                        }}
                                        className={cn('pbk:cursor-pointer pbk:rounded-full pbk:border pbk:border-border pbk:px-3 pbk:py-1 pbk:text-xs pbk:hover:border-primary pbk:hover:text-primary')}
                                    >
                                        {game === 'All' ? `${preset.game}: ` : ''}
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>
            </div>

            <Section title={'Result'} actions={<span className={'pbk:text-xs pbk:text-muted-foreground'}>what the node is told to leave out</span>}>
                {ignore.isError && <Alert type={'warning'}>The .pteroignore could not be read, so it is not shown here.</Alert>}
                {result.length === 0 ? (
                    <p className={'pbk:text-sm pbk:text-muted-foreground'}>Nothing: the node uses the server&apos;s .pteroignore on its own.</p>
                ) : (
                    <pre className={'pbk:max-h-64 pbk:overflow-auto pbk:rounded-md pbk:bg-muted/40 pbk:px-3 pbk:py-2 pbk:font-mono pbk:text-xs'}>{result.join('\n')}</pre>
                )}
            </Section>

            <div className={'pbk:flex pbk:justify-end pbk:gap-2'}>
                <Button.Text onClick={onDone}>Cancel</Button.Text>
                <Button isLoading={saving} disabled={!name.trim() || taken || (mode === 'include' && current.length === 0)} onClick={save}>
                    {profile ? 'Save profile' : 'Create profile'}
                </Button>
            </div>
        </div>
    );
}
