import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, httpErrorToHuman, toast, useCurrentServerRequired } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { pictureApi, pictureKeys, type ServerPicture as Picture } from '../pictures';
import { cssUrlToken, eggColour, useSettings } from '../settings';

/**
 * On a server's Settings page: the picture on its dashboard card. The server's own, or else its
 * game's default from the admin, or else the panel's.
 */
export default function ServerPicture() {
    const settings = useSettings();
    const server = useCurrentServerRequired().attributes;
    const identifier = server.identifier;
    const queryClient = useQueryClient();
    const picture = useQuery({ queryKey: pictureKeys.server(identifier), queryFn: () => pictureApi.get(identifier), enabled: settings.enabled && settings.cards === 'banner' });
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    if (!settings.enabled || settings.cards !== 'banner' || !picture.data?.canChange) return null;

    const data = picture.data;
    const colour = eggColour((server as { egg_tags?: string[] }).egg_tags) ?? 'var(--primary)';
    const run = async (action: () => Promise<Picture>, done: string) => {
        setBusy(true);
        try {
            queryClient.setQueryData(pictureKeys.server(identifier), await action());
            await queryClient.invalidateQueries({ queryKey: ['prism-layout', 'pictures'] });
            toast.success(done);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };
    const source = data.source === 'server' ? 'This server’s own picture.' : data.source === 'egg' ? `The default for ${data.egg}.` : data.url ? 'The panel’s default.' : `No picture: a pattern in the game’s colour.`;

    return (
        <section className='pt-surface pla:mt-4 pla:flex pla:flex-col pla:gap-3 pla:rounded-lg pla:border pla:border-border pla:bg-card pla:p-4'>
            <div>
                <h3 className='pla:font-semibold'>Card picture</h3>
                <p className='pla:text-sm pla:text-muted-foreground'>The picture at the top of this server&apos;s card on the dashboard. {source}</p>
            </div>
            <div
                className='pla:h-24 pla:max-w-md pla:rounded-md pla:border pla:border-border'
                style={{
                    background: `linear-gradient(to bottom, transparent, var(--card)), ${data.url ? `${cssUrlToken(data.url)} center / cover, ` : ''}repeating-linear-gradient(135deg, color-mix(in oklab, ${colour} 30%, transparent) 0 12px, color-mix(in oklab, ${colour} 18%, transparent) 12px 24px)`,
                }}
                aria-hidden
            />
            <div className='pla:flex pla:flex-wrap pla:gap-2'>
                <input ref={input} type='file' accept='image/png,image/jpeg,image/webp,image/gif,image/svg+xml' className='pla:hidden' onChange={(event) => event.target.files?.[0] && void run(() => pictureApi.upload(identifier, event.target.files![0]), 'Picture saved.')} />
                <Button isSecondary size='small' isLoading={busy} onClick={() => input.current?.click()}>
                    <NamedIcon name='upload' size={14} /> {data.source === 'server' ? 'Replace' : 'Upload a picture'}
                </Button>
                {data.source === 'server' && (
                    <Button.Text size='small' disabled={busy} onClick={() => void run(() => pictureApi.remove(identifier), 'Back to the default picture.')}>
                        Use the default
                    </Button.Text>
                )}
            </div>
            <p className='pla:text-xs pla:text-muted-foreground'>PNG, JPG, WebP, GIF or SVG, up to 2 MB. A wide picture works best.</p>
        </section>
    );
}
