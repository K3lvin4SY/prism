import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        // Shown with the page off too, so components and incidents can be prepared first.
        screens.register('admin-status', () => import('./screens/StatusScreen').then(configStore.liveModule), { visible: () => true });
    },
});
