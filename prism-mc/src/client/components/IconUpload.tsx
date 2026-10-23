import { useRef, useState } from 'react';
import { Button, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { deleteIcon, uploadIcon } from '../api/properties';

/** Cuts the centre square out of an image and scales it to the 64×64 PNG Minecraft wants. */
export async function toServerIcon(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('That file is not an image the browser can read.'));
            element.src = url;
        });

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d')!;
        context.imageSmoothingEnabled = side > 64;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 64, 64);

        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(url);
    }
}

export default function IconUpload({ server, icon, onChange }: { server: string; icon: string | null; onChange: () => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        try {
            await uploadIcon(server, await toServerIcon(file));
            toast.success('Server icon saved.');
            onChange();
        } catch (error) {
            toast.error(error instanceof Error && !('isAxiosError' in error) ? error.message : httpErrorToHuman(error));
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            await deleteIcon(server);
            onChange();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={'mcs:mt-1'}>
            <div className={'mcs:flex mcs:gap-2 mcs:items-center'}>
                <input
                    ref={input}
                    type={'file'}
                    accept={'image/png,image/jpeg,image/webp,image/gif'}
                    className={'mcs:hidden'}
                    onChange={(event) => upload(event.target.files?.[0])}
                />
                <Button size={'small'} isLoading={busy} onClick={() => input.current?.click()}>
                    Upload image
                </Button>
                {icon && (
                    <Button.Text size={'small'} disabled={busy} onClick={remove}>
                        Remove
                    </Button.Text>
                )}
            </div>
            <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>
                PNG, JPG, WebP or GIF. The centre square is cut out, scaled to 64×64 and stored as server-icon.png.
            </p>
        </div>
    );
}
