import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Spinner, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

interface EggPicture {
    id: number;
    name: string;
    tags: string[];
    servers: number;
    url: string | null;
}

const URL_BASE = '/api/admin/extensions/prism-layout/pictures/eggs';
const KEY = ['prism-extensions', 'egg-pictures'] as const;

/**
 * Prism Layout's picture for each egg's Banner cards. A server can still pick its own on its
 * Settings page; without either, the card picture above is used.
 */
export default function EggPictures() {
    const queryClient = useQueryClient();
    const eggs = useQuery({ queryKey: KEY, queryFn: async () => (await http.get<{ data: EggPicture[] }>(URL_BASE)).data.data });

    return (
        <section className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>Pictures by game</h3>
            <p className={'ppx:px-4 ppx:pt-3 ppx:text-xs ppx:text-muted-foreground'}>Each egg&apos;s picture on Banner cards. People who can rename a server can give it its own on the server&apos;s Settings page. Saved straight away.</p>
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
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const send = async (file: File | null) => {
        setBusy(true);
        try {
            if (file) {
                const form = new FormData();
                form.append('file', file);
                onList((await http.post<{ data: EggPicture[] }>(`${URL_BASE}/${egg.id}`, form)).data.data);
            } else {
                onList((await http.delete<{ data: EggPicture[] }>(`${URL_BASE}/${egg.id}`)).data.data);
            }
            toast.success(file ? `Picture for ${egg.name} saved.` : `Picture for ${egg.name} removed.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    return (
        <div className={'ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:px-4 ppx:py-3'}>
            <div className={'ppx:flex ppx:h-12 ppx:w-24 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:overflow-hidden ppx:rounded-md ppx:border ppx:border-dashed ppx:border-border ppx:bg-muted/40'}>
                {egg.url ? <img src={egg.url} alt={''} className={'ppx:h-full ppx:w-full ppx:object-cover'} /> : <NamedIcon name={'image'} size={18} className={'ppx:text-muted-foreground'} />}
            </div>
            <div className={'ppx:min-w-40 ppx:flex-1'}>
                <p className={'ppx:text-sm ppx:font-medium'}>{egg.name}</p>
                <p className={'ppx:text-xs ppx:text-muted-foreground'}>
                    {egg.servers} {egg.servers === 1 ? 'server' : 'servers'}
                    {egg.tags.length > 0 && ` · ${egg.tags.join(', ')}`}
                </p>
            </div>
            <input ref={input} type={'file'} accept={'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'} className={'ppx:hidden'} onChange={(event) => event.target.files?.[0] && void send(event.target.files[0])} />
            <Button isSecondary size={'small'} isLoading={busy} onClick={() => input.current?.click()}>
                <NamedIcon name={'upload'} size={14} /> {egg.url ? 'Replace' : 'Upload'}
            </Button>
            {egg.url && (
                <Button.Danger isSecondary size={'small'} disabled={busy} onClick={() => void send(null)}>
                    Remove
                </Button.Danger>
            )}
        </div>
    );
}
