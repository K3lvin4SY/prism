import { defineTheme, skin, type ThemeSkins } from '@pterodactyl/sdk/theme';
import { listenForPreview } from './settings';

/**
 * Every box the panel draws gets the surface class the Surfaces setting styles: cards, rows,
 * tables, charts and stat tiles, and, as floating surfaces that keep their own shadow, dialogs,
 * menus and select lists.
 */
const skins: ThemeSkins = {
    Card: skin('Card', { root: (state, below) => below('pt-surface') }),
    ListRow: skin('ListRow', { root: (state, below) => below('pt-surface') }),
    Table: skin('Table', { root: (state, below) => below('pt-surface') }),
    ChartCard: skin('ChartCard', { root: (state, below) => below('pt-surface') }),
    Stat: skin('Stat', { root: (state, below) => below(state.variant === 'tile' ? 'pt-surface' : '') }),
    DropdownMenu: skin('DropdownMenu', { root: (state, below) => below('pt-surface pt-overlay') }),
    Select: skin('Select', { popup: (state, below) => below('pt-surface pt-overlay') }),
    Dialog: skin('Dialog', { backdrop: (state, below) => below('backdrop-blur-sm'), root: (state, below) => below('pt-surface pt-overlay') }),
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
