import { useState } from 'react';
import { Button, Dialog, Input, Select, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { playerAction, type PlayerAction } from '../../api/players';
import { searchItems } from '../../lib/items';

/** Kick, ban or mute with a reason, and for bans a length. */
export function ReasonDialog({
    server,
    title,
    confirm,
    build,
    withDuration,
    onClose,
    onDone,
}: {
    server: string;
    title: string;
    confirm: string;
    build: (reason: string, duration: string | undefined) => PlayerAction;
    withDuration?: boolean;
    onClose: () => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            await playerAction(server, build(reason.trim(), duration || undefined));
            toast.success('Done.');
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={title}>
            <div className={'trs:flex trs:flex-col trs:gap-3'}>
                <label className={'trs:flex trs:flex-col trs:gap-1'}>
                    <span className={'trs:text-xs trs:uppercase trs:tracking-wide trs:text-muted-foreground'}>Reason</span>
                    <Input value={reason} onChange={(event) => setReason(event.target.value.replace(/"/g, ''))} placeholder={'Shown to the player'} />
                </label>
                {withDuration && (
                    <label className={'trs:flex trs:flex-col trs:gap-1'}>
                        <span className={'trs:text-xs trs:uppercase trs:tracking-wide trs:text-muted-foreground'}>Length</span>
                        <Select
                            value={duration}
                            onChange={(value) => setDuration(String(value))}
                            options={[
                                { value: '', label: 'Permanent' },
                                { value: '1h', label: 'One hour' },
                                { value: '1d', label: 'One day' },
                                { value: '7d', label: 'One week' },
                                { value: '30d', label: 'Thirty days' },
                            ]}
                        />
                    </label>
                )}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button.Danger isLoading={busy} onClick={submit}>
                    {confirm}
                </Button.Danger>
            </Dialog.Footer>
        </Dialog>
    );
}

/** Gives an online player an item, found by name. */
export function GiveDialog({ server, player, onClose }: { server: string; player: string; onClose: () => void }) {
    const [search, setSearch] = useState('');
    const [item, setItem] = useState<{ id: number; name: string } | null>(null);
    const [amount, setAmount] = useState('1');
    const [busy, setBusy] = useState(false);
    const results = item ? [] : searchItems(search, 12);

    const submit = async () => {
        if (!item) return;
        setBusy(true);
        try {
            await playerAction(server, { action: 'give', name: player, item: item.id, amount: Math.max(1, Math.min(9999, Number(amount) || 1)) });
            toast.success(`Gave ${player} ${item.name}.`);
            onClose();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`Give ${player} an item`}>
            <div className={'trs:flex trs:flex-col trs:gap-3'}>
                {item ? (
                    <div className={'trs:flex trs:items-center trs:justify-between trs:rounded-md trs:bg-muted/50 trs:p-3 trs:text-sm'}>
                        <span>
                            {item.name} <span className={'trs:text-muted-foreground'}>#{item.id}</span>
                        </span>
                        <Button.Text size={'small'} onClick={() => setItem(null)}>
                            Change
                        </Button.Text>
                    </div>
                ) : (
                    <>
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={'Find an item…'} autoFocus />
                        <div className={'trs:flex trs:max-h-64 trs:flex-col trs:overflow-y-auto'}>
                            {results.map((result) => (
                                <button
                                    key={result.id}
                                    type={'button'}
                                    onClick={() => setItem(result)}
                                    className={'trs:flex trs:justify-between trs:rounded trs:px-2 trs:py-1.5 trs:text-left trs:text-sm trs:cursor-pointer trs:hover:bg-muted'}
                                >
                                    <span>{result.name}</span>
                                    <span className={'trs:text-xs trs:text-muted-foreground'}>#{result.id}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
                <label className={'trs:flex trs:flex-col trs:gap-1'}>
                    <span className={'trs:text-xs trs:uppercase trs:tracking-wide trs:text-muted-foreground'}>Amount</span>
                    <Input value={amount} inputMode={'numeric'} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} className={'trs:w-32'} />
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button isLoading={busy} disabled={!item} onClick={submit}>
                    Give
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
