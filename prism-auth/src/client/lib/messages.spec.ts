import { afterEach, describe, expect, it } from 'vitest';
import { markFor } from '../components/ProviderMark';
import { captureStatus, clearStatus, failureMessage, peekStatus } from './messages';

describe('failureMessage', () => {
    it('names the provider', () => {
        expect(failureMessage('cancelled', 'Discord')).toBe('Signing in with Discord was cancelled.');
        expect(failureMessage('nonsense', null)).toBe('Signing in with the provider did not work. Please try again.');
    });
});

describe('captureStatus', () => {
    afterEach(() => {
        clearStatus();
        window.history.replaceState(null, '', '/');
    });

    it('takes the status once and clears it from the address bar', () => {
        window.history.replaceState(null, '', '/auth/login?prism-auth=error&reason=unlinked&provider=github&redirect=%2Fserver%2Fx');
        captureStatus();

        expect(peekStatus('error')).toEqual({ status: 'error', reason: 'unlinked', provider: 'github' });
        expect(peekStatus('signup')).toBeNull();
        expect(window.location.search).toBe('?redirect=%2Fserver%2Fx');

        clearStatus();
        expect(peekStatus('error')).toBeNull();
    });
});

describe('markFor', () => {
    it('uses the brand marks, and the preset names for OpenID Connect', () => {
        expect(markFor({ type: 'github', name: 'GitHub' })).toBe('brand-github');
        expect(markFor({ type: 'oidc', name: 'Microsoft Entra ID' })).toBe('brand-windows');
        expect(markFor({ type: 'oidc', name: 'Authentik' })).toBe('key-round');
    });
});
