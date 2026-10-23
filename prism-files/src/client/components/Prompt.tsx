import { useState, type ReactNode } from 'react';
import { Button, Dialog, Input } from '@pterodactyl/sdk';

/** A small dialog that asks for one line of text, such as a file name. */
export default function Prompt({
    title,
    label,
    initial = '',
    confirm,
    validate,
    onSubmit,
    onClose,
    children,
}: {
    title: string;
    label: string;
    initial?: string;
    confirm: string;
    validate?: (value: string) => string | null;
    onSubmit: (value: string) => Promise<unknown> | void;
    onClose: () => void;
    children?: ReactNode;
}) {
    const [value, setValue] = useState(initial);
    const [busy, setBusy] = useState(false);
    const error = value !== initial || value !== '' ? (validate?.(value) ?? null) : null;

    const submit = async () => {
        if (error || busy) return;
        setBusy(true);
        try {
            await onSubmit(value.trim());
            onClose();
        } catch {
            // The action has already shown why.
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={title}>
            <label className={'pfl:flex pfl:flex-col pfl:gap-1 pfl:text-sm'}>
                {label}
                <Input
                    autoFocus
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && submit()}
                    onFocus={(event) => {
                        // Selects the name without its extension, as file managers do.
                        const dot = event.target.value.lastIndexOf('.');
                        event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
                    }}
                    $hasError={!!error}
                    className={'pfl:font-mono'}
                />
                {error && <span className={'pfl:text-xs pfl:text-destructive'}>{error}</span>}
            </label>
            {children}
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button onClick={submit} isLoading={busy} disabled={!!error || value.trim() === ''}>
                    {confirm}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
