import { useCurrentServer, type SdkServer } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { PullCard } from '../components/Widgets';
import { getConfig } from '../config';
import { useConsoleFeed } from '../feed';
import { useStore } from '../store';

/**
 * Keeps the server's console feed running on every server page, so Prism Console has the
 * output when it opens, and shows image pull progress as a floating card away from the console.
 */
export default function ServerLayout({ Default }: ViewProps<'layout.server'>) {
    const server = useCurrentServer();
    const config = getConfig();

    return (
        <>
            <Default />
            {config.enabled && server && <Feed server={server} />}
        </>
    );
}

function Feed({ server }: { server: SdkServer }) {
    const store = useStore(useConsoleFeed(server));
    const config = getConfig();
    const onConsole = /\/server\/[^/]+\/?$/.test(window.location.pathname);

    if (!config.floatingProgress || !config.features.pullProgress || !store.pullProgress || onConsole) return null;

    return <PullCard store={store} floating />;
}
