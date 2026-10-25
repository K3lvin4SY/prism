import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, cn, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

interface EggPicture {
    id: number;
    name: string;
    tags: string[];
    servers: number;
    url: string | null;
    logo: string | null;
}

type Kind = 'picture' | 'logo';

const URL_BASE = '/api/admin/extensions/prism-layout/pictures/eggs';
const KEY = ['prism-core', 'egg-pictures'] as const;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

/**
 * Prism Layout's picture for each egg's Banner cards and its logo for Rows cards. A server can
 * still pick its own picture on its Settings page; without either, the card picture above is
 * used. An egg without a logo shows the default for its tag, or a server icon.
 */
export default function EggPictures() {
    const queryClient = useQueryClient();
    const eggs = useQuery({ queryKey: KEY, queryFn: async () => (await http.get<{ data: EggPicture[] }>(URL_BASE)).data.data });

    return (
        <section className={'pt-surface ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>Pictures and logos by game</h3>
            <p className={'ppx:px-4 ppx:pt-3 ppx:text-xs ppx:text-muted-foreground'}>
                Each egg&apos;s picture on Banner cards, and its logo on Rows cards when cards show the game by logo. Without a logo, Minecraft, Terraria, Rust, Garry&apos;s Mod, Source and voice eggs use a built-in one by their tag, and other eggs a server icon. People who can rename a server can give it its own picture on the server&apos;s Settings page. Saved straight away.
            </p>
            {eggs.isLoading ? (
                <Spinner centered />
            ) : eggs.isError ? (
                <div className={'ppx:p-4'}>
                    <Alert type={'danger'}>{httpErrorToHuman(eggs.error)}</Alert>
                </div>
            ) : (
                <div className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border'}>
                    {(eggs.data ?? []).map((egg) => (
                        <Row key={egg.id} egg={egg} onList={(list) => queryClient.setQueryData(KEY, list)} />
                    ))}
                </div>
            )}
        </section>
    );
}

function Row({ egg, onList }: { egg: EggPicture; onList: (list: EggPicture[]) => void }) {
    return (
        <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-4 ppx:px-4 ppx:py-3'}>
            <div className={'ppx:min-w-40 ppx:flex-1'}>
                <p className={'ppx:text-sm ppx:font-medium'}>{egg.name}</p>
                <p className={'ppx:text-xs ppx:text-muted-foreground'}>
                    {egg.servers} {egg.servers === 1 ? 'server' : 'servers'}
                    {egg.tags.length > 0 && ` · ${egg.tags.join(', ')}`}
                </p>
            </div>
            <Upload egg={egg} kind={'picture'} onList={onList} />
            <Upload egg={egg} kind={'logo'} onList={onList} />
        </div>
    );
}

/** One image of an egg, its picture or its logo, with Upload or Replace and Remove. */
function Upload({ egg, kind, onList }: { egg: EggPicture; kind: Kind; onList: (list: EggPicture[]) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const url = kind === 'picture' ? egg.url : egg.logo;
    const address = kind === 'picture' ? `${URL_BASE}/${egg.id}` : `${URL_BASE}/${egg.id}/logo`;
    const noun = kind === 'picture' ? 'Picture' : 'Logo';

    const send = async (file: File | null) => {
        setBusy(true);
        try {
            if (file) {
                const form = new FormData();
                form.append('file', file);
                onList((await http.post<{ data: EggPicture[] }>(address, form)).data.data);
            } else {
                onList((await http.delete<{ data: EggPicture[] }>(address)).data.data);
            }
            toast.success(file ? `${noun} for ${egg.name} saved.` : `${noun} for ${egg.name} removed.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    return (
        <div className={'ppx:flex ppx:items-center ppx:gap-2'}>
            <div
                title={kind === 'picture' ? 'Banner picture' : url ? 'Logo' : 'No logo: the default for its tag shows'}
                className={cn(
                    'ppx:flex ppx:h-12 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:overflow-hidden ppx:rounded-md ppx:border ppx:border-dashed ppx:border-border ppx:bg-muted/40',
                    kind === 'picture' ? 'ppx:w-24' : 'ppx:w-12'
                )}
            >
                {url ? <img src={url} alt={''} className={cn('ppx:h-full ppx:w-full', kind === 'picture' ? 'ppx:object-cover' : 'ppx:object-contain')} /> : <NamedIcon name={kind === 'picture' ? 'image' : 'server'} size={18} className={'ppx:text-muted-foreground'} />}
            </div>
            <div className={'ppx:flex ppx:flex-col ppx:gap-1'}>
                <input ref={input} type={'file'} accept={ACCEPT} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void send(event.target.files[0])} />
                <Button isSecondary size={'xsmall'} isLoading={busy} onClick={() => input.current?.click()}>
                    <NamedIcon name={'upload'} size={12} /> {url ? `Replace ${noun.toLowerCase()}` : `${noun}`}
                </Button>
                {url && (
                    <Button.Danger isSecondary size={'xsmall'} disabled={busy} onClick={() => void send(null)}>
                        Remove
                    </Button.Danger>
                )}
            </div>
        </div>
    );
}
