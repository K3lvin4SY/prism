import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, ButtonStyle, Spinner, cn, useOpenLoginCheckpoint } from '@pterodactyl/sdk';
import { loginResult, providersQuery, redirectUrl, type PublicProvider } from '../api';
import { configStore } from '../config';
import { clearStatus, failureMessage, peekStatus } from '../lib/messages';
import ProviderMark from './ProviderMark';

/**
 * Under the panel's sign-in form: a button per provider, what came of the last provider
 * sign-in, and the hand-off to the panel's own two-factor screen.
 */
export default function ProviderButtons() {
    const config = configStore.use();
    const providers = useQuery(providersQuery).data ?? [];
    const openCheckpoint = useOpenLoginCheckpoint();
    const [status] = useState(() => peekStatus('error', 'expired', 'checkpoint'));
    const [handing, setHanding] = useState(status?.status === 'checkpoint');

    // A provider sign-in for an account with two-factor: on to the panel's code screen.
    useEffect(() => {
        if (status?.status !== 'checkpoint') return;
        clearStatus();
        void loginResult()
            .then((result) => {
                if (result && !result.complete) return openCheckpoint(result.confirmation_token);
                if (result?.complete) window.location.assign(result.intended);
            })
            .finally(() => setHanding(false));
    }, [status, openCheckpoint]);

    const providerName = (slug: string | null) => providers.find((provider) => provider.slug === slug)?.name ?? null;

    return (
        <div className={'pau:mt-4 pau:flex pau:flex-col pau:gap-3'}>
            {status?.status === 'error' && <Alert type={'danger'}>{failureMessage(status.reason, providerName(status.provider))}</Alert>}
            {status?.status === 'expired' && <Alert type={'warning'}>That confirmation link has expired or was already used. Sign up again to get a new one.</Alert>}
            {handing && (
                <div className={'pau:flex pau:items-center pau:justify-center pau:gap-2 pau:text-sm pau:text-muted-foreground'}>
                    <Spinner size={'small'} /> Checking your two-factor code…
                </div>
            )}

            {providers.length > 0 && (
                <>
                    <div className={'pau:flex pau:items-center pau:gap-3 pau:text-xs pau:text-muted-foreground'}>
                        <span className={'pau:h-px pau:flex-1 pau:bg-border'} />
                        {config.dividerText && <span>{config.dividerText}</span>}
                        <span className={'pau:h-px pau:flex-1 pau:bg-border'} />
                    </div>
                    <div className={cn(config.buttonStyle === 'icons' ? 'pau:flex pau:flex-wrap pau:justify-center pau:gap-2' : 'pau:flex pau:flex-col pau:gap-2')}>
                        {providers.map((provider) => (
                            <ProviderButton key={provider.slug} provider={provider} compact={config.buttonStyle === 'icons'} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function ProviderButton({ provider, compact }: { provider: PublicProvider; compact: boolean }) {
    // A real link: the provider's page is a full page load, and back comes to the panel.
    return (
        <ButtonStyle
            as={'a'}
            href={redirectUrl(provider.slug, 'login')}
            isSecondary
            title={compact ? provider.label : undefined}
            aria-label={provider.label}
            style={provider.color ? { borderColor: provider.color } : undefined}
            className={cn('pau-provider pau:no-underline', compact ? 'pau:size-11 pau:justify-center pau:p-0' : 'pau:w-full pau:justify-center pau:gap-2')}
        >
            <ProviderMark provider={provider} />
            {!compact && <span>{provider.label}</span>}
        </ButtonStyle>
    );
}
