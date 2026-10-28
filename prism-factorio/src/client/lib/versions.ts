/** Compares two versions such as 2.1.23: negative when a is older. */
export function compareVersions(a: string, b: string): number {
    const x = a.split('.').map(Number);
    const y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    }

    return 0;
}

/** "2.1.23" -> "2.1" */
export function major(version: string): string {
    return version.split('.').slice(0, 2).join('.');
}

/** The versions grouped by major version, newest first. */
export function groupByMajor(versions: string[]): { major: string; versions: string[] }[] {
    const groups: { major: string; versions: string[] }[] = [];
    for (const version of [...versions].sort((a, b) => compareVersions(b, a))) {
        const key = major(version);
        const group = groups.find((entry) => entry.major === key);
        if (group) group.versions.push(version);
        else groups.push({ major: key, versions: [version] });
    }

    return groups;
}

/** What a choice resolves to: "latest" is the newest stable version. */
export function resolve(choice: string, overview: { stable: string | null; experimental: string | null }): string | null {
    if (choice === 'latest') return overview.stable;
    if (choice === 'experimental') return overview.experimental;

    return choice;
}
