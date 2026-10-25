import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { startPreviewHub } from './hub';

export default definePterodactylExtension({
    setup({ screens }) {
        // Runs on every page; does something only in the preview window.
        startPreviewHub();
        screens.register('properties', () => import('./PropertiesScreen'));
    },
});
