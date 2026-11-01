/** The shared path that already covers this one (itself or a folder above it), if any. */
export function coveredBy(paths: string[], path: string): string | null {
    return paths.find((shared) => shared === path || shared === '/' || path.startsWith(`${shared}/`)) ?? null;
}

/** Shares a path; anything it now covers is dropped, as the folder shares it too. */
export function addPath(paths: string[], path: string): string[] {
    if (coveredBy(paths, path)) return paths;

    return [...paths.filter((shared) => !(path === '/' || shared.startsWith(`${path}/`))), path];
}

/** The folders from the top down to this one, for a breadcrumb. */
export function crumbs(directory: string): { name: string; path: string }[] {
    const parts = directory.split('/').filter(Boolean);

    return [{ name: '/', path: '/' }, ...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }))];
}
