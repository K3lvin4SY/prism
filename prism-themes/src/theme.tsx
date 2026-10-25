import { defineTheme, skin, type ThemeSkins } from '@pterodactyl/sdk/theme';
import { listenForPreview } from './settings';

/** Cards, rows and menus get the surface class the looks style: glass, neon, paper and the rest. */
const skins: ThemeSkins = {
    Card: skin('Card', { root: (state, below) => below('pt-surface') }),
    ListRow: skin('ListRow', { root: (state, below) => below('pt-surface') }),
    DropdownMenu: skin('DropdownMenu', { root: (state, below) => below('pt-surface') }),
    Dialog: skin('Dialog', { backdrop: (state, below) => below('backdrop-blur-sm') }),
};

/*
 * Only the look: colors, fonts, surfaces and the background. The panel's own layout stays, and
 * Prism Layout, an extension, places things when it is on.
 */
export default defineTheme({
    ui: skins,
    setup() {
        listenForPreview();
    },
});
