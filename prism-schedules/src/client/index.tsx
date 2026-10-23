import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('server.schedules', { load: () => import('./views/SchedulesView') });
    },
});
