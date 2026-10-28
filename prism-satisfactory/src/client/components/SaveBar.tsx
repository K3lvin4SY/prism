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
                    'pt-surface pt-overlay sfy:sticky sfy:bottom-4 sfy:z-10 sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-3 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card sfy:p-3 sfy:shadow-lg sfy:transition-opacity',
                    always || dirty ? 'sfy:opacity-100' : 'sfy:pointer-events-none sfy:opacity-0'
                )}
            >
                {extra}
                <div className={'sfy:relative sfy:flex sfy:min-w-0 sfy:flex-1 sfy:items-center sfy:gap-1.5'}>
                    <span className={'sfy:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
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
                            className={'sfy:flex sfy:size-6 sfy:cursor-pointer sfy:items-center sfy:justify-center sfy:rounded-full sfy:text-muted-foreground sfy:hover:bg-muted sfy:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'pt-surface pt-overlay sfy:absolute sfy:bottom-full sfy:left-0 sfy:z-20 sfy:mb-3 sfy:w-80 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-popover sfy:p-3 sfy:text-xs sfy:shadow-xl'}>
                            <ul className={'sfy:flex sfy:flex-col sfy:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'sfy:flex sfy:min-w-0 sfy:flex-col'}>
                                        <span className={'sfy:truncate sfy:font-medium'}>{change.label}</span>
                                        <span className={'sfy:truncate sfy:text-muted-foreground'}>
                                            {change.from} → <span className={'sfy:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'sfy:mt-2 sfy:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'sfy:mt-2 sfy:border-t sfy:border-border sfy:pt-2 sfy:text-muted-foreground'}>Click for the details.</p>
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
                    <div className={'sfy:flex sfy:max-h-[60vh] sfy:w-full sfy:flex-col sfy:gap-4 sfy:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'sfy:rounded-md sfy:border sfy:border-destructive/40 sfy:bg-destructive/10 sfy:p-3 sfy:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'sfy:flex sfy:flex-col sfy:gap-1'}>
                                {section && <h4 className={'sfy:text-xs sfy:font-semibold sfy:tracking-wider sfy:text-muted-foreground sfy:uppercase'}>{section}</h4>}
                                <ul className={'sfy:flex sfy:flex-col sfy:divide-y sfy:divide-border sfy:rounded-md sfy:border sfy:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'sfy:flex sfy:items-start sfy:gap-3 sfy:px-3 sfy:py-2'}>
                                                <div className={'sfy:min-w-0 sfy:flex-1'}>
                                                    <p className={'sfy:text-sm sfy:font-medium'}>
                                                        {change.label} <span className={'sfy:font-mono sfy:text-xs sfy:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'sfy:text-sm sfy:wrap-break-word'}>
                                                        <span className={'sfy:text-muted-foreground sfy:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'sfy:mx-1.5 sfy:inline sfy:text-muted-foreground'} />
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
                        {count === 0 && <p className={'sfy:text-sm sfy:text-muted-foreground'}>Nothing left to save.</p>}
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
