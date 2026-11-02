import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        screens.register('admin-nodes', () => import('./screens/NodesScreen').then(configStore.liveModule), { visible: () => true });
    },
});
