import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, PageContentBlock, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { emailsKey, getEmails } from '../api';
import DeliveryLog from '../components/DeliveryLog';
import EmailEditor from '../components/EmailEditor';
import { configStore } from '../config';
import { NamedIcon } from '../icons';
import { customised } from '../lib/template';

type Section = 'emails' | 'log';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
    { id: 'emails', label: 'Emails', icon: 'mail' },
    { id: 'log', label: 'Delivery log', icon: 'list' },
];

/** The admin area's "Emails": the wording of each of the panel's emails, and what was sent. */
export default function MailScreen() {
    const config = configStore.use();
    const [section, setSection] = useState<Section>('emails');
    const [picked, setPicked] = useState<string | null>(null);
    const query = useQuery({ queryKey: emailsKey, queryFn: getEmails });
    const email = query.data?.find((item) => item.key === picked) ?? query.data?.[0];

    return (
        <PageContentBlock title={'Emails'}>
            <div className={'pml:mx-auto pml:flex pml:max-w-6xl pml:flex-col pml:gap-4'}>
                <div role={'tablist'} className={'pml:flex pml:gap-1 pml:self-start pml:rounded-lg pml:border pml:border-border pml:p-1'}>
                    {SECTIONS.map((item) => (
                        <button
                            key={item.id}
                            type={'button'}
                            role={'tab'}
                            aria-selected={section === item.id}
                            onClick={() => setSection(item.id)}
                            className={'pml:flex pml:items-center pml:gap-2 pml:rounded-md pml:px-3 pml:py-1.5 pml:text-sm ' + (section === item.id ? 'pml:bg-accent pml:font-semibold pml:text-accent-foreground' : 'pml:text-muted-foreground pml:hover:text-foreground')}
                        >
                            <NamedIcon name={item.icon} size={16} /> {item.label}
                        </button>
                    ))}
                </div>

                {!config.enabled && section === 'emails' && <Alert type={'warning'}>Branding is off in Prism Properties, so emails go out as the panel words them. What you save here is kept for when it is on again.</Alert>}

                {section === 'log' && <DeliveryLog />}

                {section === 'emails' && (
                    <>
                        {query.isLoading && <Spinner centered />}
                        {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                        {query.data && email && (
                            <div className={'pml:grid pml:gap-4 pml:lg:grid-cols-[16rem_minmax(0,1fr)]'}>
                                <nav className={'pt-surface pml:flex pml:flex-col pml:self-start pml:overflow-hidden pml:rounded-xl pml:border pml:border-border pml:bg-card'}>
                                    {query.data.map((item) => (
                                        <button
                                            key={item.key}
                                            type={'button'}
                                            onClick={() => setPicked(item.key)}
                                            className={'pml:flex pml:items-center pml:justify-between pml:gap-2 pml:border-b pml:border-border pml:px-4 pml:py-3 pml:text-left pml:text-sm pml:last:border-b-0 ' + (item.key === email.key ? 'pml:bg-accent/40 pml:font-semibold' : 'pml:hover:bg-accent/20')}
                                        >
                                            {item.label}
                                            {customised(item.template) && <span className={'pml:size-2 pml:shrink-0 pml:rounded-full pml:bg-primary'} title={'Has your own wording'} />}
                                        </button>
                                    ))}
                                </nav>
                                <EmailEditor key={email.key} email={email} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </PageContentBlock>
    );
}
