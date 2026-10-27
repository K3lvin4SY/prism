import { useState, type ReactNode } from 'react';
import { Button, Dialog, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';

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
                    'pt-surface pt-overlay cks:sticky cks:bottom-4 cks:z-10 cks:flex cks:flex-wrap cks:items-center cks:gap-3 cks:rounded-lg cks:border cks:border-border cks:bg-card cks:p-3 cks:shadow-lg cks:transition-opacity',
                    always || dirty ? 'cks:opacity-100' : 'cks:pointer-events-none cks:opacity-0'
                )}
            >
                {extra}
                <div className={'cks:relative cks:flex cks:min-w-0 cks:flex-1 cks:items-center cks:gap-1.5'}>
                    <span className={'cks:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
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
                            className={'cks:flex cks:size-6 cks:cursor-pointer cks:items-center cks:justify-center cks:rounded-full cks:text-muted-foreground cks:hover:bg-muted cks:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'pt-surface pt-overlay cks:absolute cks:bottom-full cks:left-0 cks:z-20 cks:mb-3 cks:w-80 cks:rounded-lg cks:border cks:border-border cks:bg-popover cks:p-3 cks:text-xs cks:shadow-xl'}>
                            <ul className={'cks:flex cks:flex-col cks:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'cks:flex cks:min-w-0 cks:flex-col'}>
                                        <span className={'cks:truncate cks:font-medium'}>{change.label}</span>
                                        <span className={'cks:truncate cks:text-muted-foreground'}>
                                            {change.from} → <span className={'cks:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'cks:mt-2 cks:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'cks:mt-2 cks:border-t cks:border-border cks:pt-2 cks:text-muted-foreground'}>Click for the details.</p>
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
                    <div className={'cks:flex cks:max-h-[60vh] cks:w-full cks:flex-col cks:gap-4 cks:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'cks:rounded-md cks:border cks:border-destructive/40 cks:bg-destructive/10 cks:p-3 cks:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'cks:flex cks:flex-col cks:gap-1'}>
                                {section && <h4 className={'cks:text-xs cks:font-semibold cks:tracking-wider cks:text-muted-foreground cks:uppercase'}>{section}</h4>}
                                <ul className={'cks:flex cks:flex-col cks:divide-y cks:divide-border cks:rounded-md cks:border cks:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'cks:flex cks:items-start cks:gap-3 cks:px-3 cks:py-2'}>
                                                <div className={'cks:min-w-0 cks:flex-1'}>
                                                    <p className={'cks:text-sm cks:font-medium'}>
                                                        {change.label} <span className={'cks:font-mono cks:text-xs cks:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'cks:text-sm cks:wrap-break-word'}>
                                                        <span className={'cks:text-muted-foreground cks:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'cks:mx-1.5 cks:inline cks:text-muted-foreground'} />
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
                        {count === 0 && <p className={'cks:text-sm cks:text-muted-foreground'}>Nothing left to save.</p>}
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
