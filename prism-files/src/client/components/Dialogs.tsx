import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Input, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { downloadUrl, readFile, type FileEntry } from '../api';
import { previewKind } from '../lib/paths';

/** A quick look at a text file, an image, audio or video. */
export function PreviewDialog({ server, entry, onClose, onEdit }: { server: string; entry: FileEntry; onClose: () => void; onEdit?: () => void }) {
    const kind = previewKind(entry.name, entry.mimetype);
    const [url, setUrl] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (kind === 'text') {
            if (entry.size > 1024 * 1024) {
                setError('This file is too large to preview. Open it in the editor or download it.');

                return;
            }
            readFile(server, entry.path).then(setText, (failure) => setError(httpErrorToHuman(failure)));
        } else if (kind) {
            downloadUrl(server, entry.path).then(setUrl, (failure) => setError(httpErrorToHuman(failure)));
        }
    }, [server, entry, kind]);

    return (
        <Dialog open onClose={onClose} title={entry.name} description={entry.path}>
            {error ? (
                <Alert type={'warning'}>{error}</Alert>
            ) : kind === 'text' ? (
                text === null ? (
                    <Spinner centered />
                ) : (
                    <pre className={'pfl:max-h-[60vh] pfl:overflow-auto pfl:rounded-md pfl:bg-black/30 pfl:p-3 pfl:font-mono pfl:text-xs pfl:whitespace-pre'}>{text || '(empty file)'}</pre>
                )
            ) : !url ? (
                <Spinner centered />
            ) : kind === 'image' ? (
                <img src={url} alt={entry.name} className={'pfl:mx-auto pfl:max-h-[60vh] pfl:max-w-full pfl:rounded-md pfl:object-contain'} style={{ imageRendering: entry.size < 20_000 ? 'pixelated' : 'auto' }} />
            ) : kind === 'audio' ? (
                <audio src={url} controls className={'pfl:w-full'} />
            ) : (
                <video src={url} controls className={'pfl:max-h-[60vh] pfl:w-full'} />
            )}
            <Dialog.Footer>
                {onEdit && kind === 'text' && (
                    <Button isSecondary onClick={onEdit}>
                        Open in the editor
                    </Button>
                )}
                <Button onClick={onClose}>Close</Button>
            </Dialog.Footer>
        </Dialog>
    );
}

const BITS = [
    ['Owner', 6],
    ['Group', 3],
    ['Others', 0],
] as const;

/** File permissions as checkboxes and an octal number, for one file or many. */
export function ChmodDialog({ entries, onSubmit, onClose }: { entries: FileEntry[]; onSubmit: (mode: string) => Promise<void>; onClose: () => void }) {
    const first = entries[0];
    const [mode, setMode] = useState(() => (first?.modeBits && /^[0-7]{3,4}$/.test(first.modeBits) ? first.modeBits.slice(-3) : first?.directory ? '755' : '644'));
    const [busy, setBusy] = useState(false);
    const value = parseInt(mode, 8) || 0;
    const toggle = (bit: number) => setMode(((value ^ (1 << bit)) & 0o777).toString(8).padStart(3, '0'));

    return (
        <Dialog open onClose={onClose} title={entries.length === 1 ? `Permissions of ${first.name}` : `Permissions of ${entries.length} items`}>
            <div className={'pfl:flex pfl:flex-col pfl:gap-3'}>
                <table className={'pfl:text-sm'}>
                    <thead>
                        <tr className={'pfl:text-muted-foreground'}>
                            <th className={'pfl:text-left pfl:font-normal'} />
                            <th className={'pfl:font-normal'}>Read</th>
                            <th className={'pfl:font-normal'}>Write</th>
                            <th className={'pfl:font-normal'}>Run</th>
                        </tr>
                    </thead>
                    <tbody>
                        {BITS.map(([label, shift]) => (
                            <tr key={label}>
                                <td className={'pfl:py-1'}>{label}</td>
                                {[2, 1, 0].map((offset) => (
                                    <td key={offset} className={'pfl:text-center'}>
                                        <Checkbox checked={(value & (1 << (shift + offset))) !== 0} onChange={() => toggle(shift + offset)} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <label className={'pfl:flex pfl:items-center pfl:gap-2 pfl:text-sm'}>
                    Mode
                    <Input value={mode} onChange={(event) => /^[0-7]{0,3}$/.test(event.target.value) && setMode(event.target.value)} className={'pfl:w-24 pfl:font-mono'} />
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button
                    isLoading={busy}
                    disabled={mode.length !== 3}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await onSubmit(mode);
                            onClose();
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Apply
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
