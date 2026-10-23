import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('page.server.console', { load: () => import('./views/ConsolePage') });
        views.override('layout.server', { load: () => import('./views/ServerLayout') });
    },
});
