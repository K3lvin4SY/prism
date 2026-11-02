import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, Select, httpErrorToHuman } from '@pterodactyl/sdk';
import { saveOffer, type Offer, type Overview } from '../api';

const eyebrow = 'pqt:font-mono pqt:text-xs pqt:font-medium pqt:uppercase pqt:tracking-[0.18em] pqt:text-muted-foreground';

/** An egg people may pick: its name for them, the image it runs and the locations it may go to. */
export default function OfferDialog({ offer, overview, onClose, onSaved }: { offer: Offer | null; overview: Overview; onClose: () => void; onSaved: () => void }) {
    const [egg, setEgg] = useState<number | null>(offer?.egg_id ?? null);
    const [label, setLabel] = useState(offer?.label ?? '');
    const [description, setDescription] = useState(offer?.description ?? '');
    const [image, setImage] = useState(offer?.image ?? '');
    const [locations, setLocations] = useState<number[]>(offer?.locations ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const images = Object.entries(overview.eggs.find((item) => item.id === egg)?.images ?? {});

    const pickEgg = (id: number) => {
        setEgg(id);
        const found = overview.eggs.find((item) => item.id === id);
        if (found && label.trim() === '') setLabel(found.name);
        setImage(Object.values(found?.images ?? {})[0] ?? '');
    };

    const save = async () => {
        if (!egg) return;
        setBusy(true);
        setError(null);
        try {
            await saveOffer({ egg_id: egg, label: label.trim(), description: description.trim(), image: image.trim(), locations }, offer?.id);
            onSaved();
        } catch (caught) {
            setError(httpErrorToHuman(caught));
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={offer ? `Change ${offer.label}` : 'Offer an egg'}>
            <div className={'pqt:flex pqt:flex-col pqt:gap-4'}>
                {error && <Alert type={'danger'}>{error}</Alert>}
                <div className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Egg</span>
                    <Select value={egg} placeholder={'Pick an egg'} searchPlaceholder={'Find an egg'} options={overview.eggs.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => pickEgg(Number(value))} />
                    <span className={'pqt:text-xs pqt:text-muted-foreground'}>Its variables start at their defaults; people can change the ones the egg lets them on the server's Startup page.</span>
                </div>
                <label className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Name people see</span>
                    <Input value={label} maxLength={64} placeholder={'Minecraft (Paper)'} onChange={(event) => setLabel(event.target.value)} />
                </label>
                <label className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Description (optional)</span>
                    <Input value={description} maxLength={255} placeholder={'Good for up to 10 players.'} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <div className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <span className={eyebrow}>Docker image</span>
                    {images.length > 1 ? (
                        <Select value={image} options={images.map(([name, value]) => ({ value, label: `${name} · ${value}`, textLabel: name }))} onChange={(value) => setImage(String(value))} />
                    ) : (
                        <Input value={image} maxLength={191} placeholder={'ghcr.io/…'} onChange={(event) => setImage(event.target.value)} />
                    )}
                </div>
                <fieldset className={'pqt:flex pqt:flex-col pqt:gap-1.5'}>
                    <legend className={eyebrow + ' pqt:mb-1.5'}>Locations</legend>
                    <div className={'pqt:grid pqt:gap-1.5 pqt:sm:grid-cols-2'}>
                        {overview.locations.map((item) => (
                            <label key={item.id} className={'pqt:flex pqt:items-center pqt:gap-2 pqt:text-sm'}>
                                <Checkbox checked={locations.includes(item.id)} onChange={(on: boolean) => setLocations((list) => (on ? [...list, item.id] : list.filter((id) => id !== item.id)))} />
                                {item.name}
                                {item.description && <span className={'pqt:text-xs pqt:text-muted-foreground'}>{item.description}</span>}
                            </label>
                        ))}
                    </div>
                    <span className={'pqt:text-xs pqt:text-muted-foreground'}>None ticked offers every location.</span>
                </fieldset>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!egg || label.trim() === '' || image.trim() === ''} isLoading={busy} onClick={() => void save()}>
                    {offer ? 'Save' : 'Offer it'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
