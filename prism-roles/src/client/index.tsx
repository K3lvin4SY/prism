import './styles.css';
import { lazy } from 'react';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens, slots }) {
        setConfig(config);
        const visible = () => configStore.use().enabled;
        screens.register('account-roles', () => import('./screens/AccountRolesScreen').then(configStore.liveModule), { visible });
        screens.register('admin-roles', () => import('./screens/AdminRolesScreen').then(configStore.liveModule), { visible });
        slots.register('server.users.permissions.before', configStore.live(lazy(() => import('./slots/RolePicker'))));
        slots.register('server.users.after', configStore.live(lazy(() => import('./slots/RoleLinks'))));
    },
});
