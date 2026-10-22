import './styles.css';
import { definePterodactylExtension, type ScreenContext } from '@pterodactyl/sdk';
import type { Feature } from './api/client';
import { setConfig } from './config';
import EggTypeField from './EggTypeField';
import { useFeatureVisible } from './hooks/useMcInfo';

/** Tabs whose screens are built. The rest stay hidden until their phase ships. */
const READY = new Set<Feature>(['players', 'versions', 'properties', 'plugins', 'mods', 'modpacks']);

/** A visibility predicate: runs as a component, so it can ask the backend what the server runs. */
const showFor = (feature: Feature) =>
    function useVisible({ server }: ScreenContext): boolean {
        const visible = useFeatureVisible(server, feature);

        return READY.has(feature) && visible;
    };

export default definePterodactylExtension({
    setup({ config, screens, forms }) {
        setConfig(config);
        forms.extend('admin.egg', EggTypeField);

        screens.register('players', () => import('./screens/PlayersScreen'), { visible: showFor('players') });
        screens.register('player', () => import('./screens/PlayerScreen'), { visible: showFor('players') });
        screens.register('versions', () => import('./screens/VersionsScreen'), { visible: showFor('versions') });
        screens.register('properties', () => import('./screens/PropertiesScreen'), { visible: showFor('properties') });
        screens.register('plugins', () => import('./screens/PluginsScreen'), { visible: showFor('plugins') });
        screens.register('mods', () => import('./screens/ModsScreen'), { visible: showFor('mods') });
        screens.register('modpacks', () => import('./screens/ModpacksScreen'), { visible: showFor('modpacks') });
    },
});
