import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('page.server.files', { load: () => import('./views/FilesPage') });
        views.override('page.server.files.editor', { load: () => import('./views/EditorPage') });
    },
});
