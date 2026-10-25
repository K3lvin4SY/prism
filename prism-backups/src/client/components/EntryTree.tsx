import { useMemo, useState } from 'react';
import { cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { covered, partial, type TreeNode } from '../selection';
import { Check, bytes } from './ui';

const LIMIT = 1500;

/** A backup's files as a tree with tick boxes; a filter opens every folder with a match. */
export default function EntryTree({ root, selected, onToggle, filter, disabled }: { root: TreeNode; selected: ReadonlySet<string>; onToggle: (path: string, on: boolean) => void; filter: string; disabled?: boolean }) {
    const [open, setOpen] = useState<Set<string>>(() => new Set(root.children.length === 1 ? [root.children[0].path] : []));
    const query = filter.trim().toLowerCase();

    // With a filter: the matching paths and the folders above them.
    const visible = useMemo(() => {
        if (!query) return null;
        const keep = new Set<string>();
        const walk = (node: TreeNode): boolean => {
            const self = node.path !== '' && node.name.toLowerCase().includes(query);
            const child = node.children.map(walk).some(Boolean);
            if (self || child) keep.add(node.path);

            return self || child;
        };
        walk(root);

        return keep;
    }, [root, query]);

    const rows: { node: TreeNode; depth: number }[] = [];
    const add = (node: TreeNode, depth: number) => {
        for (const child of node.children) {
            if (rows.length >= LIMIT) return;
            if (visible && !visible.has(child.path)) continue;
            rows.push({ node: child, depth });
            if (child.directory && (visible ? true : open.has(child.path))) add(child, depth + 1);
        }
    };
    add(root, 0);

    if (root.children.length === 0) return <p className={'pbk:py-6 pbk:text-center pbk:text-sm pbk:text-muted-foreground'}>This backup is empty.</p>;

    return (
        <div className={'pbk:max-h-[32rem] pbk:overflow-auto pbk:rounded-md pbk:border pbk:border-border'}>
            {rows.map(({ node, depth }) => {
                const ticked = covered(selected, node.path);
                const some = node.directory && partial(selected, node.path);
                const expanded = visible ? true : open.has(node.path);

                return (
                    <div
                        key={node.path}
                        className={cn('pbk:flex pbk:items-center pbk:gap-2 pbk:border-b pbk:border-border/60 pbk:py-1.5 pbk:pr-3 pbk:text-sm pbk:last:border-b-0', ticked && 'pbk:bg-primary/5')}
                        style={{ paddingLeft: 12 + depth * 18 }}
                    >
                        <Check checked={ticked} partial={some} disabled={disabled} onChange={(on) => onToggle(node.path, on)} label={`Pick ${node.path}`} />
                        <button
                            type={'button'}
                            className={cn('pbk:flex pbk:min-w-0 pbk:flex-1 pbk:items-center pbk:gap-1.5 pbk:text-left', node.directory && 'pbk:cursor-pointer')}
                            onClick={() =>
                                node.directory &&
                                !visible &&
                                setOpen((current) => {
                                    const next = new Set(current);
                                    next.has(node.path) ? next.delete(node.path) : next.add(node.path);

                                    return next;
                                })
                            }
                        >
                            {node.directory ? <NamedIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} className={'pbk:shrink-0 pbk:text-muted-foreground'} /> : <span className={'pbk:w-[13px] pbk:shrink-0'} />}
                            <NamedIcon name={node.directory ? 'folder' : 'file'} size={14} className={cn('pbk:shrink-0', node.directory ? 'pbk:text-primary' : 'pbk:text-muted-foreground')} />
                            <span className={'pbk:truncate'}>{node.name}</span>
                        </button>
                        <span className={'pbk:shrink-0 pbk:text-xs pbk:tabular-nums pbk:text-muted-foreground'}>
                            {node.directory ? `${node.files.toLocaleString()} files · ` : ''}
                            {bytes(node.size)}
                        </span>
                    </div>
                );
            })}
            {rows.length >= LIMIT && <p className={'pbk:p-3 pbk:text-xs pbk:text-muted-foreground'}>Showing the first {LIMIT.toLocaleString()} rows. Use the filter to find more.</p>}
        </div>
    );
}
