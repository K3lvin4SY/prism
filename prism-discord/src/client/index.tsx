import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        const visible = () => configStore.use().enabled;
        screens.register('hooks', () => import('./screens/HooksScreen').then(configStore.liveModule), { visible });
        screens.register('account', () => import('./screens/AccountScreen').then(configStore.liveModule), { visible });
    },
});
