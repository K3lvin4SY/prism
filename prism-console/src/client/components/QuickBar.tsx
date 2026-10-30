import { useRef, useState, type FormEvent } from 'react';
import { Button, Checkbox, Dialog, Input, cn, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { useQuickCommands, type QuickCommandInput } from '../api';
import type { QuickCommand } from '../config';
import { useDismiss } from './Popover';

interface Props {
    server: string;
    onRun: (command: string) => void;
}

const chip = 'pcn:inline-flex pcn:h-8 pcn:items-center pcn:gap-2 pcn:rounded-md pcn:border pcn:px-3 pcn:text-sm pcn:cursor-pointer pcn:transition-colors';

/**
 * The server's quick commands as a row of buttons above the command line, shared by everyone
 * who can use its console. A button shows its label, or its command without one.
 */
export default function QuickBar({ server, onRun }: Props) {
    const { commands, add, update, remove } = useQuickCommands(server);
    // The button being edited, or 'new' while adding one.
    const [editing, setEditing] = useState<QuickCommand | 'new' | null>(null);
    const [confirming, setConfirming] = useState<QuickCommand | null>(null);
    const root = useRef<HTMLDivElement>(null);
    useDismiss(root, editing !== null, () => setEditing(null));

    const run = (command: QuickCommand) => (command.confirm ? setConfirming(command) : onRun(command.command));

    return (
        <div ref={root} className={'pcn:relative pcn:flex pcn:flex-wrap pcn:items-center pcn:gap-2 pcn:border-t pcn:border-white/10 pcn:px-3 pcn:pt-2'}>
            {commands.map((command) => (
                <div key={command.id} className={'pcn:group pcn:relative'}>
                    <button
                        type={'button'}
                        onClick={() => run(command)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setEditing(command);
                        }}
                        title={command.label ? `${command.command}\nRight-click to edit` : 'Right-click to edit'}
                        className={cn(chip, 'pcn:max-w-64 pcn:border-white/10 pcn:bg-white/5 pcn:hover:border-primary/60 pcn:hover:bg-white/10', editing === command && 'pcn:border-primary')}
                    >
                        <span className={'pcn:font-mono pcn:text-primary'}>/</span>
                        <span className={cn('pcn:truncate', !command.label && 'pcn:font-mono')}>{command.label || command.command}</span>
                    </button>
                    <button
                        type={'button'}
                        onClick={() => setEditing(command)}
                        aria-label={`Edit ${command.label || command.command}`}
                        className={'pcn:absolute pcn:-right-1.5 pcn:-top-1.5 pcn:hidden pcn:size-5 pcn:items-center pcn:justify-center pcn:rounded-full pcn:border pcn:border-border pcn:bg-card pcn:text-muted-foreground pcn:cursor-pointer pcn:hover:text-foreground pcn:group-hover:flex pcn:focus-visible:flex'}
                    >
                        <NamedIcon name={'pencil'} size={11} />
                    </button>
                </div>
            ))}
            <button
                type={'button'}
                onClick={() => setEditing(editing === 'new' ? null : 'new')}
                className={cn(chip, 'pcn:border-dashed pcn:border-white/25 pcn:text-muted-foreground pcn:hover:border-primary/60 pcn:hover:text-foreground', editing === 'new' && 'pcn:border-primary pcn:text-foreground')}
            >
                <NamedIcon name={'plus'} size={14} /> Add
            </button>

            {editing !== null && (
                <Editor
                    key={editing === 'new' ? 'new' : editing.id}
                    command={editing === 'new' ? null : editing}
                    onSave={async (input) => {
                        await (editing === 'new' ? add(input) : update(editing.id, input));
                        setEditing(null);
                    }}
                    onRemove={
                        editing === 'new'
                            ? undefined
                            : async () => {
                                  await remove(editing.id);
                                  setEditing(null);
                              }
                    }
                    onCancel={() => setEditing(null)}
                />
            )}

            <Dialog.Confirm
                open={confirming !== null}
                onClose={() => setConfirming(null)}
                title={`Run ${confirming?.label || confirming?.command}?`}
                confirm={'Run'}
                onConfirmed={() => {
                    if (confirming) onRun(confirming.command);
                    setConfirming(null);
                }}
            >
                This sends <code className={'pcn:font-mono'}>{confirming?.command}</code> to the server.
            </Dialog.Confirm>
        </div>
    );
}

function Editor({ command, onSave, onRemove, onCancel }: { command: QuickCommand | null; onSave: (input: QuickCommandInput) => Promise<void>; onRemove?: () => Promise<void>; onCancel: () => void }) {
    const [label, setLabel] = useState(command?.label ?? '');
    const [text, setText] = useState(command?.command ?? '');
    const [confirm, setConfirm] = useState(command?.confirm ?? false);
    const [busy, setBusy] = useState(false);

    const attempt = async (action: () => Promise<void>) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
            setBusy(false);
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (text.trim() === '') return;
        void attempt(() => onSave({ label: label.trim() || null, command: text.trim(), confirm }));
    };

    return (
        <form
            onSubmit={submit}
            className={'pt-surface pt-overlay pcn:absolute pcn:bottom-full pcn:left-3 pcn:z-30 pcn:mb-2 pcn:flex pcn:w-80 pcn:max-w-[calc(100%-1.5rem)] pcn:flex-col pcn:gap-3 pcn:rounded-lg pcn:border pcn:border-border pcn:bg-card pcn:p-3 pcn:text-foreground pcn:shadow-xl'}
        >
            <p className={'pcn:text-xs pcn:font-medium pcn:uppercase pcn:tracking-widest pcn:text-muted-foreground'}>{command ? 'Edit quick command' : 'New quick command'}</p>
            <label className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:text-sm'}>
                Command
                <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={'save-all'} className={'pcn:font-mono'} autoFocus maxLength={1000} />
            </label>
            <label className={'pcn:flex pcn:flex-col pcn:gap-1 pcn:text-sm'}>
                <span>
                    Label <span className={'pcn:text-muted-foreground'}>(optional)</span>
                </span>
                <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={'Save world'} maxLength={48} />
            </label>
            <label className={'pcn:flex pcn:items-center pcn:gap-2 pcn:text-sm'}>
                <Checkbox checked={confirm} onChange={setConfirm} /> Ask before running
            </label>
            <p className={'pcn:text-xs pcn:text-muted-foreground'}>Everyone who can use this server&apos;s console sees it.</p>
            <div className={'pcn:flex pcn:items-center pcn:gap-2'}>
                {onRemove && (
                    <Button.Danger type={'button'} size={'small'} isSecondary disabled={busy} onClick={() => void attempt(onRemove)}>
                        Remove
                    </Button.Danger>
                )}
                <span className={'pcn:flex-1'} />
                <Button.Text type={'button'} size={'small'} onClick={onCancel}>
                    Cancel
                </Button.Text>
                <Button type={'submit'} size={'small'} isLoading={busy} disabled={text.trim() === ''}>
                    {command ? 'Save' : 'Add'}
                </Button>
            </div>
        </form>
    );
}
