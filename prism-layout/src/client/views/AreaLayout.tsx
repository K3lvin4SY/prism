import { cn } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { useSettings } from '../settings';

type Area = 'layout.server' | 'layout.account' | 'layout.admin';

/**
 * The server, account and admin areas keep the layer below (the theme's layout, and Prism Console's
 * when it is on), so nothing it adds is lost. Prism Layout's shell draws the area's pages, so the
 * class added here lets the stylesheet hide the panel's own menu for them.
 */
function area<K extends Area>(kind: K) {
    return function AreaLayout({ className, Default }: ViewProps<K>) {
        const settings = useSettings();
        const drawn = settings.enabled && (kind !== 'layout.admin' || settings.admin_styled);

        return <Default className={drawn ? cn(className, 'pla-area') : className} />;
    };
}

export const ServerLayout = area('layout.server');
export const AccountLayout = area('layout.account');
export const AdminLayout = area('layout.admin');
