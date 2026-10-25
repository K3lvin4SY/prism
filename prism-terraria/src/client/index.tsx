import './styles.css';
import { definePterodactylExtension, type ScreenContext } from '@pterodactyl/sdk';
import type { Feature } from './api/client';
import { configStore, setConfig, tabEnabled } from './config';
import EggTypeField from './EggTypeField';
import { useFeatureVisible } from './hooks/useTerrariaInfo';

/** Tabs whose screens are built. The rest stay hidden until their phase ships. */
const READY = new Set<Feature>(['players', 'properties', 'versions', 'world', 'mods', 'plugins']);

/** A visibility predicate: runs as a component, so it can ask the backend what the server runs. */
const showFor = (feature: Feature) =>
    function useVisible({ server }: ScreenContext): boolean {
        configStore.use();
        const visible = useFeatureVisible(server, feature);

        // The player page goes with the Players tab.
        return READY.has(feature) && visible && tabEnabled(feature);
    };

export default definePterodactylExtension({
    setup({ config, screens, forms }) {
        setConfig(config);
        forms.extend('admin.egg', configStore.live(EggTypeField));

        screens.register('players', () => import('./screens/PlayersScreen').then(configStore.liveModule), { visible: showFor('players') });
        screens.register('player', () => import('./screens/PlayerScreen').then(configStore.liveModule), { visible: showFor('players') });
        screens.register('versions', () => import('./screens/VersionsScreen').then(configStore.liveModule), { visible: showFor('versions') });
        screens.register('properties', () => import('./screens/SettingsScreen').then(configStore.liveModule), { visible: showFor('properties') });
        screens.register('world', () => import('./screens/WorldScreen').then(configStore.liveModule), { visible: showFor('world') });
        screens.register('mods', () => import('./screens/ModsScreen').then(configStore.liveModule), { visible: showFor('mods') });
        screens.register('plugins', () => import('./screens/PluginsScreen').then(configStore.liveModule), { visible: showFor('plugins') });
    },
});
