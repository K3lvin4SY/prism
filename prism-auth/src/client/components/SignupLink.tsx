import { useEffect, useState } from 'react';
import { confirmation as loadConfirmation, pending as loadPending, type Confirmation, type Pending } from '../api';
import { configStore } from '../config';
import { clearStatus, peekStatus } from '../lib/messages';
import ConfirmDialog from './ConfirmDialog';
import SignupDialog from './SignupDialog';

/**
 * Under the sign-in card: "New here? Create an account" when sign-up is on, the sign-up form
 * a provider sign-in with no account comes back to, and the confirmation an emailed link opens.
 */
export default function SignupLink() {
    const config = configStore.use();
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    const [confirming, setConfirming] = useState<{ token: string; confirmation: Confirmation } | null>(null);

    useEffect(() => {
        if (peekStatus('confirm')) {
            clearStatus();
            // The token comes in the fragment; it leaves the address bar at once.
            const token = window.location.hash.slice(1);
            window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
            if (token) void loadConfirmation(token).then((value) => value && setConfirming({ token, confirmation: value }));

            return;
        }
        if (!peekStatus('signup')) return;
        clearStatus();
        void loadPending().then((value) => {
            if (!value) return;
            setPending(value);
            setOpen(true);
        });
    }, []);

    return (
        <>
            {config.signup.enabled && (
                <p className={'pau:mt-4 pau:text-center pau:text-sm pau:text-muted-foreground'}>
                    New here?{' '}
                    <button type={'button'} onClick={() => setOpen(true)} className={'pau:font-medium pau:text-primary pau:cursor-pointer pau:hover:underline'}>
                        Create an account
                    </button>
                </p>
            )}
            {confirming && <ConfirmDialog token={confirming.token} confirmation={confirming.confirmation} onClose={() => setConfirming(null)} />}
            {open && (
                <SignupDialog
                    pending={pending}
                    onClose={() => {
                        setOpen(false);
                        setPending(null);
                    }}
                />
            )}
        </>
    );
}
