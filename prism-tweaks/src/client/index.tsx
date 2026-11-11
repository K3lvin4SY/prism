import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';
import ServerLimitsField from './fields/ServerLimitsField';
import UserLimitsField from './fields/UserLimitsField';

export default definePterodactylExtension({
    setup({ config, forms }) {
        setConfig(config);
        forms.extend('admin.user', configStore.live(UserLimitsField));
        forms.extend('admin.server', configStore.live(ServerLimitsField));
    },
});
