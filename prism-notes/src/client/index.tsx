import './styles.css';
import { lazy } from 'react';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, screens, slots }) {
        setConfig(config);
        screens.register('notes', () => import('./screens/NotesScreen').then(configStore.liveModule), { visible: () => configStore.use().enabled });
        slots.register('server.console.before', configStore.live(lazy(() => import('./slots/PinnedNotes'))));
    },
});
