import { describe, expect, it } from 'vitest';
import type { SdkServer } from '@pterodactyl/sdk';
import { branchName, isOlder } from '../api/versions';
import { sidesLabel } from '../components/mods/ModCard';
import { mightBeCoreKeeper } from '../hooks/useCoreKeeperInfo';

describe('branches', () => {
    it('names the public branch Latest', () => {
        expect(branchName({ id: 'public' })).toBe('Latest');
        expect(branchName({ id: '1.2.1.5' })).toBe('1.2.1.5');
    });

    it('knows which builds are older', () => {
        expect(isOlder('1.2.1.5', 'public')).toBe(true);
        expect(isOlder('public', '1.2.1.5')).toBe(false);
        expect(isOlder('1.1.2.10', '1.2.0.7')).toBe(true);
        expect(isOlder('1.1.2.10', '1.1.2.0')).toBe(false);
    });
});

describe('detection before asking the server', () => {
    const server = (tags: string[], invocation: string) => ({ attributes: { egg_tags: tags, invocation } }) as unknown as SdkServer;

    it('knows the Core Keeper egg by its startup, as it has no tag', () => {
        expect(mightBeCoreKeeper(server(['standalone'], 'export DISPLAY=:0; xvfb-run ./CoreKeeperServer -batchmode'))).toBe(true);
        expect(mightBeCoreKeeper(server(['core-keeper'], 'something else'))).toBe(true);
        expect(mightBeCoreKeeper(server(['minecraft'], 'java -jar server.jar'))).toBe(false);
    });
});

describe('sides', () => {
    it('warns about client-only mods', () => {
        expect(sidesLabel(['Client'])).toMatchObject({ label: 'Client only', warn: true });
        expect(sidesLabel(['Server', 'Client'])).toMatchObject({ label: 'Client and server', warn: false });
        expect(sidesLabel([])).toBeNull();
    });
});
