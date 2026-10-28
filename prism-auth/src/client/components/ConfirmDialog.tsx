import { useState } from 'react';
import { Alert, Button, Dialog, httpErrorToHuman, useOpenLoginCheckpoint } from '@pterodactyl/sdk';
import { confirm, type Confirmation } from '../api';
import { failureMessage } from '../lib/messages';
import ProviderMark from './ProviderMark';

/**
 * Opened from the emailed link: the account is only made when the person presses Confirm, so a
 * mail scanner opening the link makes nothing.
 */
export default function ConfirmDialog({ token, confirmation, onClose }: { token: string; confirmation: Confirmation; onClose: () => void }) {
    const openCheckpoint = useOpenLoginCheckpoint();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const outcome = await confirm(token);
            if (outcome.status !== 'signed-in') {
                setError(outcome.status === 'expired' ? 'That confirmation link has expired or was already used. Sign up again to get a new one.' : failureMessage(outcome.status, null));
            } else if (outcome.result.complete) {
                window.location.assign(outcome.result.intended);
            } else {
                await openCheckpoint(outcome.result.confirmation_token);
            }
        } catch (caught) {
            setError(httpErrorToHuman(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} preventExternalClose title={'Confirm your email'}>
            <div className={'pau:flex pau:flex-col pau:gap-3 pau:text-sm'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                <p>
                    Make the account <strong>{confirmation.username}</strong> for <strong>{confirmation.email}</strong>?
                </p>
                {confirmation.provider && (
                    <div className={'pt-surface pau:flex pau:items-center pau:gap-3 pau:rounded-lg pau:border pau:border-border pau:bg-muted/30 pau:p-3'}>
                        <ProviderMark provider={confirmation.provider} size={28} />
                        <div className={'pau:min-w-0 pau:text-xs pau:text-muted-foreground'}>
                            It signs in with the {confirmation.provider.name} account <strong className={'pau:text-foreground'}>{confirmation.provider_account ?? 'used to sign up'}</strong>.
                        </div>
                    </div>
                )}
                <p className={'pau:text-xs pau:text-muted-foreground'}>If you did not ask for this, cancel and no account is made.</p>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} onClick={() => void submit()}>
                    Confirm
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
