import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        screens.register('links', () => import('./screens/LinksScreen').then(configStore.liveModule), { visible: () => configStore.use().enabled });
    },
});
