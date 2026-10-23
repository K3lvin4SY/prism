import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { apply, read } from './branding';

export default definePterodactylExtension({
    setup({ config, views }) {
        // Runs for guests too, so the sign-in pages get the logo.
        apply(read(config));
        views.override('layout.app', { load: () => import('./views/AppLayout') });
    },
});
