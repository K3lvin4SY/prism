import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, httpErrorToHuman, toast, useOpenLoginCheckpoint } from '@pterodactyl/sdk';
import { forgetPending, resend, signup, type Pending } from '../api';
import { configStore } from '../config';
import { NamedIcon } from '../icons';
import { passwordChecks, validUsername } from '../lib/password';
import ProviderMark from './ProviderMark';
import Turnstile from './Turnstile';

type Errors = Record<string, string>;

/** Laravel's validation errors, one message per field. */
function fieldErrors(error: unknown): Errors {
    const errors = (error as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
    if (Array.isArray(errors)) {
        // The panel's API shape: [{ meta: { source_field }, detail }]
        return Object.fromEntries(
            errors.map((entry: { meta?: { source_field?: string }; detail?: string }) => [entry.meta?.source_field ?? 'form', entry.detail ?? 'Please check this.'])
        );
    }
    if (errors && typeof errors === 'object') return Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value)]));

    return {};
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className={'pau:flex pau:flex-col pau:gap-1 pau:text-sm'}>
            <span className={'pau:font-medium'}>{label}</span>
            {children}
            {error ? <span className={'pau:text-xs pau:text-destructive'}>{error}</span> : hint ? <span className={'pau:text-xs pau:text-muted-foreground'}>{hint}</span> : null}
        </label>
    );
}

/**
 * The sign-up form, in a dialog over the sign-in page. Started from a provider sign-in it is
 * filled with what the provider shared, and the password is optional: the provider signs in.
 */
export default function SignupDialog({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
    const config = configStore.use();
    const openCheckpoint = useOpenLoginCheckpoint();
    const opened = useRef(Date.now());
    const [email, setEmail] = useState(pending?.email ?? '');
    const [username, setUsername] = useState(pending?.username ?? '');
    const [first, setFirst] = useState(pending?.name?.split(' ')[0] ?? '');
    const [last, setLast] = useState(pending?.name?.split(' ').slice(1).join(' ') ?? '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [terms, setTerms] = useState(false);
    const [website, setWebsite] = useState('');
    const [turnstile, setTurnstile] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);

        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const checks = passwordChecks(password, config.password);
    const passwordOk = (pending && password === '') || checks.every((check) => check.passed);
    const ready =
        email.includes('@') &&
        (config.signup.username === 'generate' || validUsername(username)) &&
        (!config.signup.names || (first.trim() !== '' && last.trim() !== '')) &&
        passwordOk &&
        (!config.signup.terms || terms) &&
        (!config.signup.turnstile || turnstile !== '');

    const close = () => {
        if (pending) void forgetPending();
        onClose();
    };

    const submit = async () => {
        setBusy(true);
        setErrors({});
        try {
            const result = await signup({
                email: email.trim(),
                username: config.signup.username === 'choose' ? username.trim() : undefined,
                name_first: config.signup.names ? first.trim() : undefined,
                name_last: config.signup.names ? last.trim() : undefined,
                password: password || undefined,
                terms,
                website,
                elapsed: Date.now() - opened.current,
                turnstile: turnstile || undefined,
            });
            if (result.status === 'sent') {
                setSent(result.email);
                setCooldown(60);
            } else if (result.result.complete) {
                window.location.assign(result.result.intended);
            } else {
                await openCheckpoint(result.result.confirmation_token);
            }
        } catch (error) {
            const found = fieldErrors(error);
            setErrors(Object.keys(found).length > 0 ? found : { form: httpErrorToHuman(error) });
        } finally {
            setBusy(false);
        }
    };

    if (sent) {
        return (
            <Dialog open onClose={onClose} title={'Check your inbox'}>
                <div className={'pau:flex pau:flex-col pau:items-center pau:gap-3 pau:py-2 pau:text-center'}>
                    <div className={'pau:flex pau:size-14 pau:items-center pau:justify-center pau:rounded-full pau:bg-primary/15 pau:text-primary'}>
                        <NamedIcon name={'mail-check'} size={28} />
                    </div>
                    <p className={'pau:text-sm'}>
                        If <strong>{sent}</strong> can be used, a link to confirm it is on its way. Open it to finish making your account and sign in.
                    </p>
                    <p className={'pau:text-xs pau:text-muted-foreground'}>Nothing there? Look in your spam folder, or send it again.</p>
                </div>
                <Dialog.Footer>
                    <Button.Text
                        disabled={cooldown > 0}
                        onClick={() =>
                            void resend(sent)
                                .then(() => {
                                    toast.success('Sent again.');
                                    setCooldown(60);
                                })
                                .catch((error) => toast.error(httpErrorToHuman(error)))
                        }
                    >
                        {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send again'}
                    </Button.Text>
                    <Button onClick={onClose}>Done</Button>
                </Dialog.Footer>
            </Dialog>
        );
    }

    return (
        <Dialog open onClose={close} preventExternalClose title={'Create an account'} description={pending ? `Finish signing up with ${pending.provider.name}.` : undefined}>
            <form
                className={'pau:flex pau:flex-col pau:gap-3'}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (ready && !busy) void submit();
                }}
            >
                {pending && (
                    <div className={'pt-surface pau:flex pau:items-center pau:gap-3 pau:rounded-lg pau:border pau:border-border pau:bg-muted/30 pau:p-3'}>
                        {pending.avatar ? <img src={pending.avatar} alt={''} className={'pau:size-10 pau:rounded-full'} /> : <ProviderMark provider={pending.provider} size={28} />}
                        <div className={'pau:min-w-0 pau:text-sm'}>
                            <div className={'pau:font-medium pau:truncate'}>{pending.name ?? pending.email ?? pending.provider.name}</div>
                            <div className={'pau:text-xs pau:text-muted-foreground'}>Your {pending.provider.name} account will sign you in here.</div>
                        </div>
                    </div>
                )}
                {errors.form && <Alert type={'danger'}>{errors.form}</Alert>}

                <Field label={'Email'} error={errors.email} hint={pending?.email_verified && email === pending.email ? `Confirmed by ${pending.provider.name}.` : 'We send a link to confirm it is yours.'}>
                    <Input type={'email'} autoComplete={'email'} required value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
                {config.signup.username === 'choose' && (
                    <Field label={'Username'} error={errors.username ?? (username && !validUsername(username) ? 'Letters, numbers, dashes, underscores and dots, starting and ending with a letter or number.' : undefined)}>
                        <Input autoComplete={'username'} required value={username} onChange={(event) => setUsername(event.target.value)} />
                    </Field>
                )}
                {config.signup.names && (
                    <div className={'pau:grid pau:gap-3 pau:sm:grid-cols-2'}>
                        <Field label={'First name'} error={errors.name_first}>
                            <Input autoComplete={'given-name'} required value={first} onChange={(event) => setFirst(event.target.value)} />
                        </Field>
                        <Field label={'Last name'} error={errors.name_last}>
                            <Input autoComplete={'family-name'} required value={last} onChange={(event) => setLast(event.target.value)} />
                        </Field>
                    </div>
                )}
                <Field label={pending ? 'Password (optional)' : 'Password'} error={errors.password} hint={pending ? `Without one, you sign in with ${pending.provider.name}. You can set one later.` : undefined}>
                    <div className={'pau:relative'}>
                        <Input type={showPassword ? 'text' : 'password'} autoComplete={'new-password'} required={!pending} value={password} onChange={(event) => setPassword(event.target.value)} className={'pau:pr-10'} />
                        <button
                            type={'button'}
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className={'pau:absolute pau:inset-y-0 pau:right-0 pau:flex pau:w-10 pau:items-center pau:justify-center pau:text-muted-foreground pau:hover:text-foreground pau:cursor-pointer'}
                        >
                            <NamedIcon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                        </button>
                    </div>
                </Field>
                {(password !== '' || !pending) && (
                    <ul className={'pau:-mt-1 pau:flex pau:flex-wrap pau:gap-x-4 pau:gap-y-1 pau:text-xs'}>
                        {checks.map((check) => (
                            <li key={check.label} className={check.passed ? 'pau:flex pau:items-center pau:gap-1 pau:text-success' : 'pau:flex pau:items-center pau:gap-1 pau:text-muted-foreground'}>
                                <NamedIcon name={check.passed ? 'check' : 'x'} size={12} /> {check.label}
                            </li>
                        ))}
                    </ul>
                )}

                {config.signup.terms && (
                    <label className={'pau:flex pau:items-start pau:gap-2 pau:text-sm'}>
                        <Checkbox checked={terms} onChange={setTerms} />
                        <span>
                            I accept the{' '}
                            <a href={config.signup.terms} target={'_blank'} rel={'noreferrer'} className={'pau:text-primary pau:underline'}>
                                terms
                            </a>
                            .{errors.terms && <span className={'pau:block pau:text-xs pau:text-destructive'}>{errors.terms}</span>}
                        </span>
                    </label>
                )}

                {/* Left empty by people; scripts fill every field. */}
                {config.signup.botTrap && (
                    <input type={'text'} name={'website'} tabIndex={-1} autoComplete={'off'} aria-hidden value={website} onChange={(event) => setWebsite(event.target.value)} className={'pau-trap'} />
                )}
                {config.signup.turnstile && (
                    <div>
                        <Turnstile siteKey={config.signup.turnstile} onToken={setTurnstile} />
                        {errors.turnstile && <span className={'pau:text-xs pau:text-destructive'}>{errors.turnstile}</span>}
                    </div>
                )}

                <button type={'submit'} hidden />
            </form>
            <Dialog.Footer>
                <Button.Text onClick={close}>Cancel</Button.Text>
                <Button disabled={!ready} isLoading={busy} onClick={() => void submit()}>
                    Create account
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
