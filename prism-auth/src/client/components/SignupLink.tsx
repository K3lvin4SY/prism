import { useEffect, useState } from 'react';
import { pending as loadPending, type Pending } from '../api';
import { configStore } from '../config';
import { clearStatus, peekStatus } from '../lib/messages';
import SignupDialog from './SignupDialog';

/**
 * Under the sign-in card: "New here? Create an account" when sign-up is on, and the sign-up form
 * a provider sign-in with no account comes back to.
 */
export default function SignupLink() {
    const config = configStore.use();
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);

    useEffect(() => {
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
