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
                    'mcs:sticky mcs:bottom-4 mcs:z-10 mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-card mcs:p-3 mcs:shadow-lg mcs:transition-opacity',
                    always || dirty ? 'mcs:opacity-100' : 'mcs:pointer-events-none mcs:opacity-0'
                )}
            >
                {extra}
                <div className={'mcs:relative mcs:flex mcs:min-w-0 mcs:flex-1 mcs:items-center mcs:gap-1.5'}>
                    <span className={'mcs:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
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
                            className={'mcs:flex mcs:size-6 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-full mcs:text-muted-foreground mcs:hover:bg-muted mcs:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'mcs:absolute mcs:bottom-full mcs:left-0 mcs:z-20 mcs:mb-3 mcs:w-80 mcs:rounded-lg mcs:border mcs:border-border mcs:bg-popover mcs:p-3 mcs:text-xs mcs:shadow-xl'}>
                            <ul className={'mcs:flex mcs:flex-col mcs:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'mcs:flex mcs:min-w-0 mcs:flex-col'}>
                                        <span className={'mcs:truncate mcs:font-medium'}>{change.label}</span>
                                        <span className={'mcs:truncate mcs:text-muted-foreground'}>
                                            {change.from} → <span className={'mcs:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'mcs:mt-2 mcs:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'mcs:mt-2 mcs:border-t mcs:border-border mcs:pt-2 mcs:text-muted-foreground'}>Click for the details.</p>
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
                    <div className={'mcs:flex mcs:max-h-[60vh] mcs:w-full mcs:flex-col mcs:gap-4 mcs:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'mcs:rounded-md mcs:border mcs:border-destructive/40 mcs:bg-destructive/10 mcs:p-3 mcs:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'mcs:flex mcs:flex-col mcs:gap-1'}>
                                {section && <h4 className={'mcs:text-xs mcs:font-semibold mcs:tracking-wider mcs:text-muted-foreground mcs:uppercase'}>{section}</h4>}
                                <ul className={'mcs:flex mcs:flex-col mcs:divide-y mcs:divide-border mcs:rounded-md mcs:border mcs:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'mcs:flex mcs:items-start mcs:gap-3 mcs:px-3 mcs:py-2'}>
                                                <div className={'mcs:min-w-0 mcs:flex-1'}>
                                                    <p className={'mcs:text-sm mcs:font-medium'}>
                                                        {change.label} <span className={'mcs:font-mono mcs:text-xs mcs:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'mcs:text-sm mcs:wrap-break-word'}>
                                                        <span className={'mcs:text-muted-foreground mcs:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'mcs:mx-1.5 mcs:inline mcs:text-muted-foreground'} />
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
                        {count === 0 && <p className={'mcs:text-sm mcs:text-muted-foreground'}>Nothing left to save.</p>}
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
