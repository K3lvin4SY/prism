import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views }) {
        setConfig(config);
        views.override('page.server.files', { load: () => import('./views/FilesPage').then(configStore.liveModule) });
        views.override('page.server.files.editor', { load: () => import('./views/EditorPage').then(configStore.liveModule) });
    },
});
