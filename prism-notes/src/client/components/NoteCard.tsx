import { Button, Checkbox, fromNow } from '@pterodactyl/sdk';
import type { Note } from '../api';
import { NamedIcon } from '../icons';
import { progress } from '../lib/checklist';
import { Markdown } from '../lib/markdown';

const eyebrow = 'pnt:font-mono pnt:text-xs pnt:font-medium pnt:uppercase pnt:tracking-[0.18em] pnt:text-muted-foreground';

interface Props {
    note: Note;
    canManage: boolean;
    /** Smaller, for the console: no buttons, the body cut short. */
    compact?: boolean;
    onTick: (item: string, done: boolean) => void;
    onEdit?: () => void;
    onPin?: () => void;
    onDelete?: () => void;
    onMove?: (by: -1 | 1) => void;
}

/** One note or checklist, with its color as a stripe down the left. */
export default function NoteCard({ note, canManage, compact = false, onTick, onEdit, onPin, onDelete, onMove }: Props) {
    const count = progress(note.items);

    return (
        <article
            className={'pt-surface pnt:relative pnt:flex pnt:min-w-0 pnt:flex-col pnt:gap-3 pnt:overflow-hidden pnt:rounded-xl pnt:border pnt:border-border pnt:bg-card pnt:py-4 pnt:pr-4 pnt:pl-5'}
            style={note.color ? { boxShadow: `inset 4px 0 0 ${note.color}` } : undefined}
        >
            <header className={'pnt:flex pnt:items-start pnt:gap-2'}>
                <div className={'pnt:min-w-0 pnt:flex-1'}>
                    <h2 className={'pnt:flex pnt:items-center pnt:gap-1.5 pnt:font-semibold pnt:text-foreground'}>
                        {note.pinned && <NamedIcon name={'pin'} size={14} className={'pnt:shrink-0 pnt:text-primary'} aria-label={'Pinned'} />}
                        <span className={'pnt:truncate'}>{note.title}</span>
                    </h2>
                    {note.kind === 'checklist' && note.items.length > 0 && (
                        <p className={eyebrow}>
                            {count.done} of {count.total} done
                        </p>
                    )}
                </div>
                {canManage && !compact && (
                    <div className={'pnt:flex pnt:shrink-0 pnt:items-center pnt:gap-0.5'}>
                        <Button.Text size={'small'} aria-label={note.pinned ? 'Unpin' : 'Pin'} title={note.pinned ? 'Unpin' : 'Pin to the top and above the console'} onClick={onPin}>
                            <NamedIcon name={note.pinned ? 'pin-off' : 'pin'} size={14} />
                        </Button.Text>
                        <Button.Text size={'small'} aria-label={'Edit'} title={'Edit'} onClick={onEdit}>
                            <NamedIcon name={'pencil'} size={14} />
                        </Button.Text>
                        <Button.Text size={'small'} aria-label={'Delete'} title={'Delete'} onClick={onDelete}>
                            <NamedIcon name={'trash-2'} size={14} />
                        </Button.Text>
                    </div>
                )}
            </header>

            {note.body.trim() !== '' && (
                <div className={compact ? 'pnt:max-h-28 pnt:overflow-hidden' : ''}>
                    <Markdown source={note.body} />
                </div>
            )}

            {note.kind === 'checklist' && note.items.length > 0 && (
                <ul className={'pnt:flex pnt:flex-col pnt:gap-1.5'}>
                    {note.items.map((item) => (
                        <li key={item.id} className={'pnt:flex pnt:items-start pnt:gap-2 pnt:text-sm'}>
                            <Checkbox checked={item.done} onChange={(done: boolean) => onTick(item.id, done)} aria-label={item.text} />
                            <span className={'pnt:min-w-0 pnt:flex-1 ' + (item.done ? 'pnt:text-muted-foreground pnt:line-through' : 'pnt:text-foreground')}>{item.text}</span>
                            {item.done && item.done_by && !compact && (
                                <span className={'pnt:shrink-0 pnt:text-xs pnt:text-muted-foreground'} title={item.done_at ?? undefined}>
                                    {item.done_by}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {!compact && (
                <footer className={'pnt:mt-auto pnt:flex pnt:items-center pnt:gap-2 pnt:text-xs pnt:text-muted-foreground'}>
                    <span className={'pnt:min-w-0 pnt:flex-1 pnt:truncate'}>
                        {note.updated_by ? `${note.updated_by}, ` : ''}
                        {fromNow(note.updated_at)}
                    </span>
                    {canManage && onMove && (
                        <span className={'pnt:flex pnt:shrink-0 pnt:gap-0.5'}>
                            <Button.Text size={'small'} aria-label={'Move earlier'} title={'Move earlier'} onClick={() => onMove(-1)}>
                                <NamedIcon name={'chevron-left'} size={14} />
                            </Button.Text>
                            <Button.Text size={'small'} aria-label={'Move later'} title={'Move later'} onClick={() => onMove(1)}>
                                <NamedIcon name={'chevron-right'} size={14} />
                            </Button.Text>
                        </span>
                    )}
                </footer>
            )}
        </article>
    );
}
