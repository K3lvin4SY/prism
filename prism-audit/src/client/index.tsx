import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        // The timeline is always there; only the alerts follow the setting.
        screens.register('admin-audit', () => import('./screens/AuditScreen').then(configStore.liveModule), { visible: () => true });
    },
});
