import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('server.backups', { load: () => import('./views/BackupsView').then(configStore.liveModule) });
    },
});
