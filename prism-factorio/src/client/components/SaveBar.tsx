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
                    'pt-surface pt-overlay fct:sticky fct:bottom-4 fct:z-10 fct:flex fct:flex-wrap fct:items-center fct:gap-3 fct:rounded-lg fct:border fct:border-border fct:bg-card fct:p-3 fct:shadow-lg fct:transition-opacity',
                    always || dirty ? 'fct:opacity-100' : 'fct:pointer-events-none fct:opacity-0'
                )}
            >
                {extra}
                <div className={'fct:relative fct:flex fct:min-w-0 fct:flex-1 fct:items-center fct:gap-1.5'}>
                    <span className={'fct:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
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
                            className={'fct:flex fct:size-6 fct:cursor-pointer fct:items-center fct:justify-center fct:rounded-full fct:text-muted-foreground fct:hover:bg-muted fct:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'pt-surface pt-overlay fct:absolute fct:bottom-full fct:left-0 fct:z-20 fct:mb-3 fct:w-80 fct:rounded-lg fct:border fct:border-border fct:bg-popover fct:p-3 fct:text-xs fct:shadow-xl'}>
                            <ul className={'fct:flex fct:flex-col fct:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'fct:flex fct:min-w-0 fct:flex-col'}>
                                        <span className={'fct:truncate fct:font-medium'}>{change.label}</span>
                                        <span className={'fct:truncate fct:text-muted-foreground'}>
                                            {change.from} → <span className={'fct:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'fct:mt-2 fct:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'fct:mt-2 fct:border-t fct:border-border fct:pt-2 fct:text-muted-foreground'}>Click for the details.</p>
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
                    <div className={'fct:flex fct:max-h-[60vh] fct:w-full fct:flex-col fct:gap-4 fct:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'fct:rounded-md fct:border fct:border-destructive/40 fct:bg-destructive/10 fct:p-3 fct:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'fct:flex fct:flex-col fct:gap-1'}>
                                {section && <h4 className={'fct:text-xs fct:font-semibold fct:tracking-wider fct:text-muted-foreground fct:uppercase'}>{section}</h4>}
                                <ul className={'fct:flex fct:flex-col fct:divide-y fct:divide-border fct:rounded-md fct:border fct:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'fct:flex fct:items-start fct:gap-3 fct:px-3 fct:py-2'}>
                                                <div className={'fct:min-w-0 fct:flex-1'}>
                                                    <p className={'fct:text-sm fct:font-medium'}>
                                                        {change.label} <span className={'fct:font-mono fct:text-xs fct:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'fct:text-sm fct:wrap-break-word'}>
                                                        <span className={'fct:text-muted-foreground fct:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'fct:mx-1.5 fct:inline fct:text-muted-foreground'} />
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
                        {count === 0 && <p className={'fct:text-sm fct:text-muted-foreground'}>Nothing left to save.</p>}
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
