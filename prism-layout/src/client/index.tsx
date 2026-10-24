import './styles.css';
import { lazy } from 'react';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { listenForPreview, setConfig } from './settings';
import { AccountLayout, AdminLayout, ServerLayout } from './views/AreaLayout';
import SignIn from './views/SignIn';

export default definePterodactylExtension({
    setup({ config, views, slots }) {
        // Runs for guests too: the logo, sizes and sign-in style are written to <html> here.
        setConfig(config);
        listenForPreview();

        for (const slot of ['auth.login.before', 'auth.password.before', 'auth.passwordReset.before', 'auth.checkpoint.before'] as const) {
            slots.register(slot, SignIn);
        }

        slots.register('server.settings.after', lazy(() => import('./views/ServerPicture')));

        views.override('layout.app', { load: () => import('./views/Shell') });
        views.override('layout.server', ServerLayout);
        views.override('layout.account', AccountLayout);
        views.override('layout.admin', AdminLayout);
        views.override('dashboard.serverList', { load: () => import('./views/ServerList') });
        views.override('dashboard.serverCard', { load: () => import('./views/ServerCard') });
    },
});
