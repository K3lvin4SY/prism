import './styles.css';
import { definePterodactylExtension, http } from '@pterodactyl/sdk';
import { startPreviewHub } from './hub';
import { installRateLimit } from './rateLimit';

export default definePterodactylExtension({
    setup({ screens }) {
        // Runs on every page; does something only in the preview window.
        startPreviewHub();
        // Every page's requests wait out the Panel's rate limit instead of failing.
        installRateLimit(http);
        screens.register('properties', () => import('./PropertiesScreen'));
    },
});
