import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, PageContentBlock, Select, Spinner, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { findUsers, getOverview, overviewKey, removeOffer, removeUserLimits, saveDefault, saveUserLimits, type Limits, type Offer } from '../api';
import LimitsForm from '../components/LimitsForm';
import OfferDialog from '../components/OfferDialog';
import { configStore } from '../config';
import { NamedIcon } from '../icons';
import { mib } from '../lib/quota';

const card = 'pt-surface pqt:overflow-hidden pqt:rounded-xl pqt:border pqt:border-border pqt:bg-card';
const head = 'pqt:flex pqt:flex-wrap pqt:items-center pqt:gap-3 pqt:border-b pqt:border-border pqt:px-5 pqt:py-4';

/** The admin area's "Quotas": everyone's limits, some people's own, and the eggs people may pick. */
export default function AdminQuotasScreen() {
    const config = configStore.use();
    const client = useQueryClient();
    const query = useQuery({ queryKey: overviewKey, queryFn: getOverview });
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<Offer | 'new' | null>(null);
    const [search, setSearch] = useState('');
    const found = useQuery({ queryKey: ['prism-quotas', 'users', search], queryFn: () => findUsers(search) });
    const data = query.data;

    const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
        setBusy(key);
        try {
            await action();
            await client.invalidateQueries({ queryKey: overviewKey });
            if (done) toast.success(done);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <PageContentBlock title={'Quotas'}>
            <div className={'pqt:mx-auto pqt:flex pqt:w-full pqt:max-w-6xl pqt:flex-col pqt:gap-4'}>
                {!config.enabled && <Alert type={'warning'}>Creating servers is off in Prism Properties, so nobody sees the Create a server page yet. Set up the limits and offers here first, then turn it on.</Alert>}
                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}

                {data && (
                    <>
                        <section className={card}>
                            <header className={head}>
                                <div className={'pqt:min-w-0 pqt:flex-1'}>
                                    <h2 className={'pqt:font-header pqt:text-lg pqt:font-semibold'}>Everyone</h2>
                                    <p className={'pqt:text-sm pqt:text-muted-foreground'}>
                                        {config.who === 'listed' ? 'Only people listed below may create servers, so these defaults are not used.' : 'What each person may use across the servers they own, unless they have their own limits below. Servers an admin made count too.'}
                                    </p>
                                </div>
                            </header>
                            <div className={'pqt:p-5'}>
                                <LimitsForm key={JSON.stringify(data.default)} limits={data.default} busy={busy === 'default'} onSave={(limits) => void run('default', () => saveDefault(limits), 'Saved everyone\'s limits.')} />
                            </div>
                        </section>

                        <section className={card}>
                            <header className={head}>
                                <div className={'pqt:min-w-0 pqt:flex-1'}>
                                    <h2 className={'pqt:font-header pqt:text-lg pqt:font-semibold'}>People with their own limits</h2>
                                    <p className={'pqt:text-sm pqt:text-muted-foreground'}>These replace everyone's limits for them.</p>
                                </div>
                                <div className={'pqt:w-72'}>
                                    <Select
                                        value={null}
                                        placeholder={'Add a person'}
                                        searchPlaceholder={'Username or email'}
                                        emptyMessage={'Nobody found'}
                                        onSearchChange={setSearch}
                                        options={(found.data ?? []).filter((user) => !data.users.some((row) => row.user.id === user.id)).map((user) => ({ value: user.id, textLabel: user.username, label: `${user.username} · ${user.email}` }))}
                                        onChange={(value) => void run(`user-${value}`, () => saveUserLimits(Number(value), data.default))}
                                    />
                                </div>
                            </header>
                            {data.users.length === 0 && <p className={'pqt:py-8 pqt:text-center pqt:text-sm pqt:text-muted-foreground'}>Nobody yet. Add a person to give them more, or less, than everyone.</p>}
                            {data.users.map((row) => (
                                <div key={row.user.id} className={'pqt:flex pqt:flex-col pqt:gap-3 pqt:border-b pqt:border-border pqt:px-5 pqt:py-4 pqt:last:border-b-0'}>
                                    <div className={'pqt:flex pqt:flex-wrap pqt:items-baseline pqt:gap-x-3'}>
                                        <span className={'pqt:font-semibold'}>{row.user.username ?? 'A deleted user'}</span>
                                        <span className={'pqt:text-xs pqt:text-muted-foreground'}>{row.user.email}</span>
                                        {row.usage && (
                                            <span className={'pqt:text-xs pqt:text-muted-foreground'}>
                                                Uses {row.usage.servers} {row.usage.servers === 1 ? 'server' : 'servers'}, {mib(row.usage.memory)} memory, {mib(row.usage.disk)} disk, {row.usage.cpu}% CPU
                                            </span>
                                        )}
                                    </div>
                                    <LimitsForm key={JSON.stringify(row.limits)} limits={row.limits} busy={busy === `user-${row.user.id}`} onSave={(limits: Limits) => void run(`user-${row.user.id}`, () => saveUserLimits(row.user.id, limits), `Saved ${row.user.username}'s limits.`)}>
                                        <Button.Text size={'small'} onClick={() => void run(`remove-${row.user.id}`, () => removeUserLimits(row.user.id))}>
                                            Use everyone's
                                        </Button.Text>
                                    </LimitsForm>
                                </div>
                            ))}
                        </section>

                        <section className={card}>
                            <header className={head}>
                                <div className={'pqt:min-w-0 pqt:flex-1'}>
                                    <h2 className={'pqt:font-header pqt:text-lg pqt:font-semibold'}>What people may create</h2>
                                    <p className={'pqt:text-sm pqt:text-muted-foreground'}>The eggs on offer, under the names people see. Servers already made stay when an offer goes.</p>
                                </div>
                                <Button onClick={() => setEditing('new')}>
                                    <NamedIcon name={'plus'} size={16} className={'pqt:mr-1'} /> Offer an egg
                                </Button>
                            </header>
                            {data.offers.length === 0 && <p className={'pqt:py-8 pqt:text-center pqt:text-sm pqt:text-muted-foreground'}>Nothing on offer, so nobody can create a server yet.</p>}
                            {data.offers.map((offer) => (
                                <div key={offer.id} className={'pqt:flex pqt:flex-wrap pqt:items-center pqt:gap-3 pqt:border-b pqt:border-border pqt:px-5 pqt:py-3 pqt:last:border-b-0'}>
                                    <div className={'pqt:min-w-0 pqt:flex-1'}>
                                        <p className={'pqt:font-semibold'}>{offer.label}</p>
                                        <p className={'pqt:truncate pqt:text-xs pqt:text-muted-foreground'}>
                                            {offer.egg ?? 'Egg deleted'} · {offer.image} · {offer.locations.length === 0 ? 'every location' : data.locations.filter((item) => offer.locations.includes(item.id)).map((item) => item.name).join(', ')}
                                        </p>
                                    </div>
                                    <Button.Text size={'small'} onClick={() => setEditing(offer)}>
                                        Change
                                    </Button.Text>
                                    <Button.Danger size={'small'} isSecondary isLoading={busy === `offer-${offer.id}`} onClick={() => void run(`offer-${offer.id}`, () => removeOffer(offer.id))}>
                                        Remove
                                    </Button.Danger>
                                </div>
                            ))}
                        </section>
                    </>
                )}
            </div>

            {editing && data && (
                <OfferDialog
                    offer={editing === 'new' ? null : editing}
                    overview={data}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void client.invalidateQueries({ queryKey: overviewKey });
                    }}
                />
            )}
        </PageContentBlock>
    );
}
