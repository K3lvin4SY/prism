import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('server.schedules', { load: () => import('./views/SchedulesView').then(configStore.liveModule) });
    },
});
