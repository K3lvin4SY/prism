import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        screens.register('account-servers', () => import('./screens/CreateServerScreen').then(configStore.liveModule), { visible: () => configStore.use().enabled });
        screens.register('admin-quotas', () => import('./screens/AdminQuotasScreen').then(configStore.liveModule), { visible: () => true });
    },
});
