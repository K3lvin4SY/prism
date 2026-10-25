import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { api, keys, profileMarker, type Profile, type State } from '../api';
import { copy } from '../components/ui';
import { getConfig } from '../config';
import { lines } from '../patterns';
import type { Model } from '../views/BackupsView';
import ProfileEditor from './ProfileEditor';

/** The server's backup profiles, and the editor for one. */
export default function ProfilesTab({ model, state, onBackUp }: { model: Model; state: State; onBackUp: (profile: string) => void }) {
    const identifier = useCurrentServerRequired().attributes.identifier;
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<Profile | 'new' | null>(null);
    const [removing, setRemoving] = useState<Profile | null>(null);
    const [busy, setBusy] = useState(false);
    const canChange = model.permissions.create;
    const full = state.profiles.length >= getConfig().maxProfiles;

    if (editing) return <ProfileEditor profile={editing === 'new' ? null : editing} profiles={state.profiles} onDone={() => setEditing(null)} />;

    return (
        <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
            <div className={'pbk:flex pbk:flex-wrap pbk:items-center pbk:gap-3'}>
                <p className={'pbk:min-w-64 pbk:flex-1 pbk:text-sm pbk:text-muted-foreground'}>
                    A profile says what a backup includes. The default one is used for every backup that names none, schedule tasks included; a schedule task can name another with the line shown on its card.
                </p>
                {canChange && (
                    <Button onClick={() => setEditing('new')} disabled={full}>
                        <NamedIcon name={'plus'} size={14} /> New profile
                    </Button>
                )}
            </div>

            {state.profiles.length === 0 ? (
                <div className={'pbk:flex pbk:flex-col pbk:items-center pbk:gap-2 pbk:rounded-lg pbk:border pbk:border-dashed pbk:border-border pbk:py-12 pbk:text-center'}>
                    <NamedIcon name={'list-checks'} size={32} className={'pbk:text-muted-foreground'} />
                    <p className={'pbk:font-medium'}>No profiles yet</p>
                    <p className={'pbk:text-sm pbk:text-muted-foreground'}>Without one, backups leave out what the server&apos;s .pteroignore lists.</p>
                </div>
            ) : (
                <div className={'pbk:grid pbk:gap-3 pbk:md:grid-cols-2'}>
                    {state.profiles.map((profile) => {
                        const patterns = lines(profile.patterns);

                        return (
                            <div key={profile.id} className={'pt-surface pbk:flex pbk:flex-col pbk:gap-3 pbk:rounded-lg pbk:border pbk:border-border pbk:bg-card pbk:p-4'}>
                                <div className={'pbk:flex pbk:items-center pbk:gap-2'}>
                                    <NamedIcon name={profile.mode === 'include' ? 'list-checks' : 'list-x'} size={18} className={'pbk:text-primary'} />
                                    <span className={'pbk:min-w-0 pbk:flex-1 pbk:truncate pbk:font-semibold'}>{profile.name}</span>
                                    {profile.isDefault && <span className={'pbk:rounded pbk:bg-primary/15 pbk:px-1.5 pbk:py-0.5 pbk:text-xs pbk:text-primary'}>Default</span>}
                                    {profile.lockBackups && <NamedIcon name={'lock'} size={14} className={'pbk:text-muted-foreground'} />}
                                </div>
                                <p className={'pbk:text-sm pbk:text-muted-foreground'}>
                                    {profile.mode === 'include' ? `Only ${patterns.length} picked ${patterns.length === 1 ? 'path' : 'paths'}` : `Everything except ${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'}${profile.applyPteroignore ? ', after the .pteroignore' : ''}`}
                                    {profile.lockBackups && ' · backups are locked'}
                                </p>
                                {patterns.length > 0 && (
                                    <pre className={'pbk:max-h-24 pbk:overflow-hidden pbk:rounded-md pbk:bg-muted/40 pbk:px-3 pbk:py-2 pbk:font-mono pbk:text-xs pbk:text-muted-foreground'}>
                                        {patterns.slice(0, 5).join('\n')}
                                        {patterns.length > 5 && `\n… ${patterns.length - 5} more`}
                                    </pre>
                                )}
                                <button type={'button'} onClick={() => copy(profileMarker(profile.name), 'Schedule line copied')} className={'pbk:flex pbk:cursor-pointer pbk:items-center pbk:gap-2 pbk:rounded-md pbk:border pbk:border-dashed pbk:border-border pbk:px-3 pbk:py-1.5 pbk:text-left pbk:font-mono pbk:text-xs pbk:text-muted-foreground pbk:hover:text-foreground'} title={'Put this line in a schedule\'s backup task to use this profile'}>
                                    <NamedIcon name={'copy'} size={12} className={'pbk:shrink-0'} />
                                    <span className={'pbk:truncate'}>{profileMarker(profile.name)}</span>
                                </button>
                                <div className={'pbk:flex pbk:flex-wrap pbk:gap-2'}>
                                    {model.permissions.create && (
                                        <Button size={'small'} onClick={() => onBackUp(profile.name)}>
                                            <NamedIcon name={'archive'} size={14} /> Back up now
                                        </Button>
                                    )}
                                    {canChange && (
                                        <Button isSecondary size={'small'} onClick={() => setEditing(profile)}>
                                            Edit
                                        </Button>
                                    )}
                                    {canChange && (
                                        <Button.Danger isSecondary size={'small'} onClick={() => setRemoving(profile)}>
                                            Delete
                                        </Button.Danger>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {removing && (
                <Dialog.Confirm
                    open
                    title={`Delete ${removing.name}?`}
                    confirm={'Delete profile'}
                    pending={busy}
                    onClose={() => setRemoving(null)}
                    onConfirmed={async () => {
                        setBusy(true);
                        try {
                            await api.deleteProfile(identifier, removing.id);
                            await queryClient.invalidateQueries({ queryKey: keys.state(identifier) });
                            toast.success('Profile deleted.');
                            setRemoving(null);
                        } catch (error) {
                            toast.error(httpErrorToHuman(error));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Backups made with it stay. A schedule task that names it fails until it names another.
                </Dialog.Confirm>
            )}
        </div>
    );
}
