/** What to tell the person when a sign-in comes back with `?prism-auth=error&reason=…`. */
export function failureMessage(reason: string | null, provider: string | null): string {
    const name = provider ?? 'the provider';
    switch (reason) {
        case 'cancelled':
            return `Signing in with ${name} was cancelled.`;
        case 'unlinked':
            return `No account here is linked to that ${name} account yet. Sign in with your password, then link ${name} from your account page.`;
        case 'taken':
            return `That ${name} account is already linked to someone else here.`;
        case 'taken-account':
            return 'An account with that email or username was made in the meantime. Sign in, or sign up again with other details.';
        case 'state':
            return 'That sign-in took too long or was started in another tab. Please try again.';
        case 'unreachable':
            return `${name} could not be reached. Please try again in a moment.`;
        case 'setup':
            return `Signing in with ${name} is not set up correctly. Please tell an administrator.`;
        case 'unknown':
            return 'That sign-in provider is not available any more.';
        case 'create':
            return 'Your account could not be made. Please tell an administrator.';
        default:
            return `Signing in with ${name} did not work. Please try again.`;
    }
}

export interface Status {
    status: string;
    reason: string | null;
    provider: string | null;
}

let captured: Status | null = null;

/**
 * Takes the `prism-auth` status a redirect put in the address bar, once, when the page loads, and
 * clears it from the address so a reload does not repeat it.
 */
export function captureStatus(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get('prism-auth');
    if (!status) return;

    captured = { status, reason: url.searchParams.get('reason'), provider: url.searchParams.get('provider') };
    for (const key of ['prism-auth', 'reason', 'provider']) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** The status the page loaded with, if it is one of these. */
export function peekStatus(...statuses: string[]): Status | null {
    return captured && statuses.includes(captured.status) ? captured : null;
}

export function clearStatus(): void {
    captured = null;
}
