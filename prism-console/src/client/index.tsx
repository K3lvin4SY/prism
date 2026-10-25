import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('page.server.console', { load: () => import('./views/ConsolePage').then(configStore.liveModule) });
        views.override('layout.server', { load: () => import('./views/ServerLayout').then(configStore.liveModule) });
    },
});
