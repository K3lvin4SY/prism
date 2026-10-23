import type { ReactNode } from 'react';
import { defineTheme, lazyView, skin, type ThemeSkins, type ViewProps } from '@pterodactyl/sdk/theme';
import { listenForPreview, useSettings } from './settings';
import { AuthLayout, LoginPage } from './views/Auth';

/** The shell draws each area's navigation, so an area's layout only places its pages. */
function AreaLayout({ children }: { children?: ReactNode }) {
    return <>{children}</>;
}

/** The admin area keeps the panel's own layout when the admin turns styling it off. */
function AdminLayout({ children, Default }: ViewProps<'layout.admin'>) {
    return useSettings().admin_styled ? <>{children as ReactNode}</> : <Default />;
}

/** Cards, rows and menus get the surface class the looks style: glass, neon, paper and the rest. */
const skins: ThemeSkins = {
    Card: skin('Card', { root: (state, below) => below('pt-surface') }),
    ListRow: skin('ListRow', { root: (state, below) => below('pt-surface') }),
    DropdownMenu: skin('DropdownMenu', { root: (state, below) => below('pt-surface') }),
    Dialog: skin('Dialog', { backdrop: (state, below) => below('backdrop-blur-sm') }),
};

export default defineTheme({
    ui: skins,
    views: {
        // The sign-in screen renders without waiting for a chunk.
        'layout.auth': AuthLayout,
        'page.auth.login': LoginPage,
        'layout.app': lazyView(() => import('./views/Shell')),
        'layout.server': AreaLayout,
        'layout.account': AreaLayout,
        'layout.admin': AdminLayout,
        'dashboard.serverList': lazyView(() => import('./views/ServerList')),
        'dashboard.serverCard': lazyView(() => import('./views/ServerCard')),
    },
    setup() {
        listenForPreview();
    },
});
