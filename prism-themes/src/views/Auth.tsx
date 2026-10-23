import { useId, type FormEvent, type ReactNode } from 'react';
import { Button, Input, Label, PanelLink, type FieldModel } from '@pterodactyl/sdk';
import { Main, Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

/** The sign-in pages: split with a picture, a centred card, or the panel's own. */
export function AuthLayout({ model, children, Default }: ViewProps<'layout.auth'>) {
    const settings = useSettings();
    if (settings.login_style === 'classic') return <Default />;

    const brand = model.brand.logoUrl ? <img src={model.brand.logoUrl} alt={model.brand.name} className='h-10 w-auto self-start' /> : <p className='font-header text-2xl font-semibold'>{model.brand.name}</p>;

    if (settings.login_style === 'centered') {
        return (
            <div className='flex min-h-dvh flex-col items-center justify-center gap-6 p-6'>
                <div className='pt-bg' aria-hidden>
                    <i />
                </div>
                <div className='flex flex-col items-center gap-2 text-center'>
                    {model.brand.logoUrl ? <img src={model.brand.logoUrl} alt={model.brand.name} className='h-12 w-auto' /> : <p className='font-header text-2xl font-semibold'>{model.brand.name}</p>}
                    {settings.login_tagline && <p className='text-sm text-muted-foreground'>{settings.login_tagline}</p>}
                </div>
                <Main className='pt-surface w-full max-w-sm rounded-xl border border-border bg-card p-6'>{children as ReactNode}</Main>
            </div>
        );
    }

    return (
        <div className='grid min-h-dvh lg:grid-cols-2'>
            <section
                className='relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex'
                style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.55), transparent 60%), var(--pt-login-image, none) center / cover, linear-gradient(135deg, var(--primary), var(--accent))' }}
            >
                {brand}
                <p className='max-w-md font-header text-4xl leading-tight font-semibold text-balance'>{settings.login_tagline}</p>
            </section>
            <div className='flex flex-col'>
                <div className='pt-bg' aria-hidden>
                    <i />
                </div>
                <div className='p-6 lg:hidden'>{brand}</div>
                <Main className='flex flex-1 items-center justify-center p-6'>
                    <div className='w-full max-w-sm'>{children as ReactNode}</div>
                </Main>
            </div>
        </div>
    );
}

function Field({ field, label }: { field: FieldModel; label: string }) {
    const id = useId();

    return (
        <div className='space-y-1.5'>
            <Label htmlFor={id}>{label}</Label>
            <Input {...field.fieldProps} id={id} $hasError={field.error !== null} aria-invalid={field.error !== null || undefined} aria-describedby={field.error ? `${id}-error` : undefined} />
            {field.error && (
                <p id={`${id}-error`} className='input-help error'>
                    {field.error}
                </p>
            )}
        </div>
    );
}

/** The sign-in form; the panel does the request, captcha, two-factor and redirect. */
export function LoginPage({ model, Default }: ViewProps<'page.auth.login'>) {
    const settings = useSettings();
    if (settings.login_style === 'classic') return <Default />;

    const { fields, Captcha } = model;
    const submit = (event: FormEvent) => {
        event.preventDefault();
        model.submit();
    };

    return (
        <form onSubmit={submit} className='space-y-5'>
            <h1 className='font-header text-2xl font-semibold'>Sign in</h1>
            <Field field={fields.username} label='Username or email' />
            <Field field={fields.password} label='Password' />
            {Captcha && <Captcha />}
            <Button type='submit' size='xlarge' disabled={!model.canSubmit} isLoading={model.submitting}>
                Sign in
            </Button>
            <Slot name='auth.login.form.after' data={model.route} />
            <PanelLink destination={model.forgotPassword} className='block text-center text-sm text-muted-foreground'>
                Forgot your password?
            </PanelLink>
        </form>
    );
}
