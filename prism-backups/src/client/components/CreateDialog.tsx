import { useState } from 'react';
import { Button, Dialog, Input, Select, Switch, useServerPermission } from '@pterodactyl/sdk';
import { NO_PROFILE, profileMarker, type Profile } from '../api';
import type { Model } from '../views/BackupsView';

const NONE = '';

/**
 * Makes a backup through the panel, with a line naming the profile: the panel's backup action,
 * wrapped by Prism Backups, turns it into the profile's patterns.
 */
export default function CreateDialog({ model, profiles, initialProfile, onClose }: { model: Model; profiles: Profile[]; initialProfile: string | null; onClose: () => void }) {
    const fallback = profiles.find((profile) => profile.isDefault)?.name ?? NONE;
    const [name, setName] = useState('');
    const [profile, setProfile] = useState(initialProfile ?? fallback);
    const picked = profiles.find((item) => item.name === profile);
    const [locked, setLocked] = useState(false);
    const [busy, setBusy] = useState(false);
    const canLock = useServerPermission('backup.delete');
    const nameError = model.validateName(name);

    const create = async () => {
        setBusy(true);
        const ok = await model.actions.create({ name, ignored: profile === NONE ? NO_PROFILE : profileMarker(profile), isLocked: locked });
        setBusy(false);
        if (ok) onClose();
    };

    return (
        <Dialog open onClose={onClose} title={'Create backup'}>
            <div className={'pbk:flex pbk:flex-col pbk:gap-4'}>
                <label className={'pbk:flex pbk:flex-col pbk:gap-1 pbk:text-sm'}>
                    Name
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Backup at ${new Date().toLocaleString()}`} autoFocus $hasError={!!nameError} />
                    {nameError && <span className={'pbk:text-xs pbk:text-destructive'}>{nameError}</span>}
                </label>
                {profiles.length > 0 && (
                    <label className={'pbk:flex pbk:flex-col pbk:gap-1 pbk:text-sm'}>
                        Profile
                        <Select
                            value={profile}
                            onChange={(value) => setProfile(String(value))}
                            options={[...profiles.map((item) => ({ value: item.name, label: `${item.name}${item.isDefault ? ' (default)' : ''}` })), { value: NONE, label: 'No profile: only .pteroignore' }]}
                        />
                        <span className={'pbk:text-xs pbk:text-muted-foreground'}>
                            {picked
                                ? picked.mode === 'include'
                                    ? `Only ${picked.patterns.split('\n').filter(Boolean).length} picked paths are backed up.`
                                    : `Everything except ${picked.patterns.split('\n').filter(Boolean).length} patterns${picked.applyPteroignore ? ' and the .pteroignore' : ''}.`
                                : 'Everything except what the server\'s .pteroignore lists.'}
                            {picked?.lockBackups && ' Backups made with it are locked.'}
                        </span>
                    </label>
                )}
                {canLock && <Switch checked={locked || !!picked?.lockBackups} disabled={!!picked?.lockBackups} onChange={setLocked} label={'Lock this backup'} description={'A locked backup is never deleted or replaced until it is unlocked.'} />}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} disabled={!!nameError} onClick={create}>
                    Start backup
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
