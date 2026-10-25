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
                    'pt-surface pt-overlay trs:sticky trs:bottom-4 trs:z-10 trs:flex trs:flex-wrap trs:items-center trs:gap-3 trs:rounded-lg trs:border trs:border-border trs:bg-card trs:p-3 trs:shadow-lg trs:transition-opacity',
                    always || dirty ? 'trs:opacity-100' : 'trs:pointer-events-none trs:opacity-0'
                )}
            >
                {extra}
                <div className={'trs:relative trs:flex trs:min-w-0 trs:flex-1 trs:items-center trs:gap-1.5'}>
                    <span className={'trs:text-sm'}>{dirty ? (count === 1 ? 'One unsaved change.' : `${count} unsaved changes.`) : 'No unsaved changes.'}</span>
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
                            className={'trs:flex trs:size-6 trs:cursor-pointer trs:items-center trs:justify-center trs:rounded-full trs:text-muted-foreground trs:hover:bg-muted trs:hover:text-foreground'}
                        >
                            <NamedIcon name={'info'} size={15} />
                        </button>
                    )}
                    {dirty && peek && (
                        <div role={'tooltip'} className={'pt-surface pt-overlay trs:absolute trs:bottom-full trs:left-0 trs:z-20 trs:mb-3 trs:w-80 trs:rounded-lg trs:border trs:border-border trs:bg-popover trs:p-3 trs:text-xs trs:shadow-xl'}>
                            <ul className={'trs:flex trs:flex-col trs:gap-1.5'}>
                                {changes.slice(0, 8).map((change) => (
                                    <li key={change.key} className={'trs:flex trs:min-w-0 trs:flex-col'}>
                                        <span className={'trs:truncate trs:font-medium'}>{change.label}</span>
                                        <span className={'trs:truncate trs:text-muted-foreground'}>
                                            {change.from} → <span className={'trs:text-foreground'}>{change.to}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {count > 8 && <p className={'trs:mt-2 trs:text-muted-foreground'}>and {count - 8} more</p>}
                            <p className={'trs:mt-2 trs:border-t trs:border-border trs:pt-2 trs:text-muted-foreground'}>Click for the details.</p>
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
                    <div className={'trs:flex trs:max-h-[60vh] trs:w-full trs:flex-col trs:gap-4 trs:overflow-y-auto'}>
                        {problems.length > 0 && (
                            <ul className={'trs:rounded-md trs:border trs:border-destructive/40 trs:bg-destructive/10 trs:p-3 trs:text-sm'}>
                                {problems.map((problem) => (
                                    <li key={problem}>{problem}</li>
                                ))}
                            </ul>
                        )}
                        {sections.map((section) => (
                            <section key={section} className={'trs:flex trs:flex-col trs:gap-1'}>
                                {section && <h4 className={'trs:text-xs trs:font-semibold trs:tracking-wider trs:text-muted-foreground trs:uppercase'}>{section}</h4>}
                                <ul className={'trs:flex trs:flex-col trs:divide-y trs:divide-border trs:rounded-md trs:border trs:border-border'}>
                                    {changes
                                        .filter((change) => (change.section ?? '') === section)
                                        .map((change) => (
                                            <li key={change.key} className={'trs:flex trs:items-start trs:gap-3 trs:px-3 trs:py-2'}>
                                                <div className={'trs:min-w-0 trs:flex-1'}>
                                                    <p className={'trs:text-sm trs:font-medium'}>
                                                        {change.label} <span className={'trs:font-mono trs:text-xs trs:text-muted-foreground'}>{change.key}</span>
                                                    </p>
                                                    <p className={'trs:text-sm trs:wrap-break-word'}>
                                                        <span className={'trs:text-muted-foreground trs:line-through'}>{change.from}</span>
                                                        <NamedIcon name={'arrow-right'} size={12} className={'trs:mx-1.5 trs:inline trs:text-muted-foreground'} />
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
                        {count === 0 && <p className={'trs:text-sm trs:text-muted-foreground'}>Nothing left to save.</p>}
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
