import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens }) {
        setConfig(config);
        // Shown with branding off too: the wording waits for it and the delivery log still fills.
        screens.register('admin-mail', () => import('./screens/MailScreen').then(configStore.liveModule), { visible: () => true });
    },
});
