import { useState, type ReactNode } from 'react';
import { Button, Dialog, NamedIcon, cn } from '@pterodactyl/sdk';

/** One unsaved change, with its old and new values already written for people. */
export interface Change {
    key: string;
    label: string;
    section?: string;
    from: string;
    to: string;
}

/** A value as people read it: an option's label, On or Off, a date, a count, or the text. */
export function describeValue(value: unknown, options?: readonly { value: unknown; label: string }[]): string {
    if (value === null || value === undefined || value === '') return '(empty)';
    const option = options?.find((item) => String(item.value) === String(value));
    if (option) return option.label;
    // Server files keep switches as the words true and false.
    if (typeof value === 'boolean' || value === 'true' || value === 'false') return value === true || value === 'true' ? 'On' : 'Off';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value))) {
        return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }
    if (typeof value === 'string') {
        // Settings stored as JSON (rules, lists) are summarised by size.
        try {
            const parsed = JSON.parse(value) as unknown;
            if (Array.isArray(parsed)) return `${parsed.length} ${parsed.length === 1 ? 'entry' : 'entries'}`;
            if (parsed && typeof parsed === 'object') return `${Object.keys(parsed).length} ${Object.keys(parsed).length === 1 ? 'entry' : 'entries'}`;
        } catch {
            // Plain text.
        }

        return value.length > 80 ? `${value.slice(0, 77)}…` : value;
    }
    if (Array.isArray(value)) return value.length === 0 ? '(none)' : value.join(', ');

    return String(value);
}

/**
 * The bar under unsaved settings: how many there are, a list on hover, the full list with undo
 * for each in a dialog, and Discard and Save.
 */
export default function SaveBar({ changes, saving, onSave, onDiscard, onUndo, extra, always = false, problems = [] }: { changes: Change[]; saving: boolean; onSave: () => void; onDiscard: () => void; onUndo?: (key: string) => void; extra?: ReactNode; always?: boolean; problems?: string[] }) {
    const [peek, setPeek] = useState(false);
    const [open, setOpen] = useState(false);
    const count = changes.length;
    const dirty = count > 0;
    const sections = [...new Set(changes.map((change) => change.section ?? ''))];

    return (
        <>
            <div
                className={cn(
                    'ppx:sticky ppx:bottom-4 ppx:z-10 ppx:flex ppx:flex-wrap ppx:items-center ppx:gap-3 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card ppx:p-3 ppx:shadow-lg ppx:transition-opacity',
                    always || dirty ? 'ppx:opacity-100' : 'ppx:pointer-events-none ppx:opacity-0'
                )}
            >
                {extra}
                <div className={'ppx:relative ppx:flex ppx:min-w-0 ppx:flex-1 ppx:items-center ppx:gap-1.5'}>
                    <span className={'ppx:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
                    {dirty && (
                        <button
                            type={'button'}
                            onClick={() => {
                                setPeek(false);
                                setOpen(true);
                            }}
                            onMouseEnter={() => setPeek(true)}
                            onMouseLeave={() => setPeek(false)}
                            onFocus={() => setPeek(true)}
                            onBlur={() => setPeek(false)}
                            aria-label={'Show the unsaved changes'}
                            className={'ppx:flex ppx:size-6 ppx:cursor-pointer ppx:items-center ppx:justify-center ppx:rounded-full ppx:text-muted-foreground ppx:hover:bg-muted ppx:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'ppx:absolute ppx:bottom-full ppx:left-0 ppx:z-20 ppx:mb-3 ppx:w-80 ppx:rounded-lg ppx:border ppx:border-border ppx:bg-popover ppx:p-3 ppx:text-xs ppx:shadow-xl'}>
                            <ul className={'ppx:flex ppx:flex-col ppx:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'ppx:flex ppx:min-w-0 ppx:flex-col'}>
                                        <span className={'ppx:truncate ppx:font-medium'}>{change.label}</span>
                                        <span className={'ppx:truncate ppx:text-muted-foreground'}>
                                            {change.from} → <span className={'ppx:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'ppx:mt-2 ppx:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'ppx:mt-2 ppx:border-t ppx:border-border ppx:pt-2 ppx:text-muted-foreground'}>Click for the details.</p>
                        </div>
                    )}
                </div>
                <Button.Text onClick={onDiscard} disabled={saving || !dirty}>
                    Discard
                </Button.Text>
                <Button onClick={onSave} isLoading={saving} disabled={!dirty || problems.length > 0}>
                    Save changes
                </Button>
            </div>

            {open && (
                <Dialog open onClose={() => setOpen(false)} title={'Unsaved changes'} description={`${count} ${count === 1 ? 'change' : 'changes'}, saved together when you press Save.`}>
                    <div className={'ppx:flex ppx:max-h-[60vh] ppx:w-full ppx:flex-col ppx:gap-4 ppx:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'ppx:rounded-md ppx:border ppx:border-destructive/40 ppx:bg-destructive/10 ppx:p-3 ppx:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'ppx:flex ppx:flex-col ppx:gap-1'}>
                                {section && <h4 className={'ppx:text-xs ppx:font-semibold ppx:tracking-wider ppx:text-muted-foreground ppx:uppercase'}>{section}</h4>}
                                <ul className={'ppx:flex ppx:flex-col ppx:divide-y ppx:divide-border ppx:rounded-md ppx:border ppx:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'ppx:flex ppx:items-start ppx:gap-3 ppx:px-3 ppx:py-2'}>
                                                <div className={'ppx:min-w-0 ppx:flex-1'}>
                                                    <p className={'ppx:text-sm ppx:font-medium'}>
                                                        {change.label} <span className={'ppx:font-mono ppx:text-xs ppx:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'ppx:text-sm ppx:wrap-break-word'}>
                                                        <span className={'ppx:text-muted-foreground ppx:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'ppx:mx-1.5 ppx:inline ppx:text-muted-foreground'} />
                                                        <span>{change.to}</span>
                                                    </p>
                                                </div>
                                                {onUndo && (
                                                    <Button.Text size={'small'} onClick={() => onUndo(change.key)} disabled={saving}>
                                                        Undo
                                                    </Button.Text>
                                                )}
                                            </li>
                                        ))}
                                </ul>
                            </section>
                        ))}
                        {count === 0 && <p className={'ppx:text-sm ppx:text-muted-foreground'}>Nothing left to save.</p>}
                    </div>
                    <Dialog.Footer>
                        <Button.Text
                            onClick={() => {
                                onDiscard();
                                setOpen(false);
                            }}
                            disabled={saving || !dirty}
                        >
                            Discard all
                        </Button.Text>
                        <Button
                            onClick={() => {
                                onSave();
                                setOpen(false);
                            }}
                            isLoading={saving}
                            disabled={!dirty || problems.length > 0}
                        >
                            Save changes
                        </Button>
                    </Dialog.Footer>
                </Dialog>
            )}
        </>
    );
}
