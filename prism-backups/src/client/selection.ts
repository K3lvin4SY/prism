/**
 * Ticked paths in a tree, kept as the top-most picks: ticking a folder picks everything in it,
 * and unticking one file inside a picked folder picks the folder's other contents instead.
 */

export interface TreeNode {
    name: string;
    path: string;
    directory: boolean;
    /** Bytes of the file, or of everything inside the folder. */
    size: number;
    files: number;
    children: TreeNode[];
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** A tree from a backup's entries; folders the archive does not list on their own are added. */
export function buildTree(entries: { p: string; s: number; d: boolean }[]): TreeNode {
    const root: TreeNode = { name: '', path: '', directory: true, size: 0, files: 0, children: [] };
    const nodes = new Map<string, TreeNode>([['', root]]);

    const ensure = (path: string): TreeNode => {
        const existing = nodes.get(path);
        if (existing) return existing;
        const parent = ensure(parentOf(path));
        const node: TreeNode = { name: path.slice(path.lastIndexOf('/') + 1), path, directory: true, size: 0, files: 0, children: [] };
        parent.children.push(node);
        nodes.set(path, node);

        return node;
    };

    for (const entry of entries) {
        if (entry.d) {
            ensure(entry.p);
            continue;
        }

        const parent = ensure(parentOf(entry.p));
        if (nodes.has(entry.p)) continue;
        const node: TreeNode = { name: entry.p.slice(entry.p.lastIndexOf('/') + 1), path: entry.p, directory: false, size: entry.s, files: 1, children: [] };
        parent.children.push(node);
        nodes.set(entry.p, node);
    }

    const total = (node: TreeNode): void => {
        if (!node.directory) return;
        node.children.forEach(total);
        node.size = node.children.reduce((sum, child) => sum + child.size, 0);
        node.files = node.children.reduce((sum, child) => sum + child.files, 0);
        node.children.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    };
    total(root);

    return root;
}

export function index(root: TreeNode): Map<string, TreeNode> {
    const map = new Map<string, TreeNode>();
    const walk = (node: TreeNode) => {
        map.set(node.path, node);
        node.children.forEach(walk);
    };
    walk(root);

    return map;
}

const within = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

/** Whether the path is picked, by itself or by a folder above it. */
export function covered(selected: ReadonlySet<string>, path: string): boolean {
    for (const pick of selected) if (within(path, pick)) return true;

    return false;
}

/** Whether something inside the folder is picked, though not the folder itself. */
export function partial(selected: ReadonlySet<string>, path: string): boolean {
    for (const pick of selected) if (pick.startsWith(`${path}/`)) return true;

    return false;
}

export function toggle(selected: ReadonlySet<string>, nodes: Map<string, TreeNode>, path: string, on: boolean): Set<string> {
    const next = new Set([...selected].filter((pick) => !pick.startsWith(`${path}/`)));

    if (on) {
        if (!covered(next, path)) next.add(path);

        return next;
    }

    if (next.delete(path)) return next;

    // Unticking inside a picked folder: pick the folder's other contents instead, level by level.
    const ancestor = [...next].find((pick) => within(path, pick));
    if (ancestor === undefined) return next;
    next.delete(ancestor);

    let folder = nodes.get(ancestor);
    while (folder && folder.path !== path) {
        const step = folder.children.find((child) => within(path, child.path));
        for (const child of folder.children) if (child !== step) next.add(child.path);
        folder = step;
    }

    return next;
}

/** Files and bytes the picks cover. */
export function totals(selected: ReadonlySet<string>, nodes: Map<string, TreeNode>): { files: number; size: number } {
    let files = 0;
    let size = 0;
    for (const pick of selected) {
        const node = nodes.get(pick);
        if (node) {
            files += node.files;
            size += node.size;
        }
    }

    return { files, size };
}
