---
name: prism-architecture
description: How the Prism extensions fit together - Prism Core and Prism Properties, the shared settings store and live preview protocol, generated icons, theme surfaces, personal preferences, the queue-backed install plans and how the extensions depend on each other. Load before changing anything that crosses extensions or touches settings, preview, icons or styling.
---

# Prism architecture

## The pieces and who depends on whom

```
prism-core (ppx)  ── Prism Properties admin page (/panel/prism), Prism Export, live preview
   ▲ required by every other extension (requires.extensions in each extension.json)
   │
   ├── prism-themes      a Panel *theme*: palettes, type, surfaces, backgrounds (no Tailwind prefix)
   ├── prism-layout (pla) the frame: navigation, server cards, branding, sign-in, announcements
   ├── prism-console (pcn), prism-files (pfl), prism-database (pdb),
   │   prism-backups (pbk), prism-schedules (psc)          better versions of Panel pages
   ├── prism-mc (mcs), prism-terraria (trs), prism-corekeeper (cks)   game-specific server screens
   └── prism-auth (pau)  sign-in providers, account sign-in methods, sign-up
```

Prism Auth's sign-in flow runs on public root routes under `/prism-auth` (`routes/root.php`, web group with the session): `/<slug>/redirect` sends the browser to the provider with state, PKCE and nonce kept once in the session (`Support/Flow.php`), `/<slug>/callback` signs in through the Panel's `CompletesLogins::complete()` (so two-factor still applies: the login slot fetches `/prism-auth/result` and opens the Panel's checkpoint screen with `useOpenLoginCheckpoint`), links an account, or holds a pending sign-up. Providers live in `prism_auth_providers` with the secret encrypted; Prism Properties edits them through `/api/admin/extensions/prism-auth/providers` (`prism-core/src/client/AuthProviders.tsx`), not as a setting. Sign-up mail goes out with `notifyNow`, not the queue.

Each extension is self-contained: its own `extension.json`, PHP provider (`src/<Name>Provider.php`, except Core and Themes), routes in `routes/{admin,client,server}.php`, migrations in `database/`, and a React client in `src/client` (Themes: `src/`). The Panel loads the PHP provider and the built `dist/client.js`.

## Prism Core: Prism Properties

`prism-core/src/client/PropertiesScreen.tsx` is one admin screen for every Prism extension's settings.

- **The list of extensions** is `PRISM` in `prism-core/src/client/api.ts` (id, name, icon, description). An extension only shows when it is installed, enabled and registered its settings.
- **Settings come from the Panel**: `GET /api/admin/extensions/<id>/settings` returns the schema (fields with `input`, `label`, `help`, `tab`, `field`, `options`, `value`), `PATCH` saves, and `/settings/<input>/file` uploads or clears a file setting. The schema is what each PHP provider declares with `Setting::make(...)`.
- **Presentation** that the schema lacks lives in Core: `hints.ts` (sections, units, ranges, placeholders per setting), `editors.tsx` (custom editors such as highlight rules, quick commands, keybinds), `DateTimeField.tsx`, `SaveBar.tsx` (unsaved changes, undo, save).
- **Extras per extension**: Layout's `LayoutPresets.tsx`, `BrandingPreview.tsx`, `EggPictures.tsx`; Themes' editor in `themes/` (`ThemeEditor.tsx`, `presets.ts`, `generate.ts`, `color.ts`, `builtins.json`); `ExportImport.tsx` (see the `prism-export-import` skill).
- After saving Prism Layout, Core calls `POST /api/admin/extensions/prism-layout/refresh` (`REFRESHES` in `api.ts`) so cached head tags update.

## The shared settings store and the live preview

Every extension reads its settings through `src/client/configStore.ts`, generated from `scripts/shared/configStore.ts` by `node scripts/shared.mjs`.

- **`config.ts`** in each extension keeps a pure `read(raw)` that turns raw settings into a typed object, and exports `configStore = createConfigStore('<id>', read)`, `setConfig(raw)` (called in `setup`), `getConfig()` and, where the backend returns fresh settings, `applyConfig(raw)`. All of these go through the store.
- **`index.tsx`** wraps every registered view, screen, slot or form field so it re-renders on a change: `load: () => import('./views/X').then(configStore.liveModule)`, `configStore.live(Component)`. In the game extensions the tab `visible` predicates call `configStore.use()` so tabs follow too.
- **The preview window** is the real Panel in a popup named `prism-preview` (the Panel refuses frames). The protocol:
  1. Editor side, `prism-core/src/client/preview.tsx`: `usePreviewDraft(id, values)` posts `{ type: 'prism-preview', extension, settings }` to the window on every change and again when the window says `prism-preview:ready`; leaving an editor sends `{}` (back to saved). `PreviewControls` (one card, beside the settings on 2xl screens, under the navigation otherwise) opens the window on the extension's own page and follows where the window really is. `usePreviewNote(id, node)` lets an editor add a note to that card (Themes does).
  2. Hub, `prism-core/src/client/hub.ts`, runs in Core's `setup` on every page but acts only in the preview window: it checks origin and source, stores each draft in `sessionStorage['prism-preview:<id>']` and re-announces it as a `window` event `prism-preview:draft`.
  3. Receiver, `configStore.ts`: in the preview window it lays the draft over the saved settings (also from sessionStorage at load, so drafts survive navigating) and re-renders everything wrapped with `live`.
  - Prism Layout (`settings.ts` `followPreview`) and Prism Themes (`settings.ts` `followPreview` → `applyPreview`, which writes tokens and `<html>` attributes from the manifest) use the same event.
  - Settings enforced on the server (permissions, limits, protected paths) only preview their look.

## Personal preferences

Some settings are defaults that each person can override for themselves:

- Prism Console: `PUT /api/client/servers/<id>/extensions/prism-console/preferences` (`terminal`, `layout`, `custom`, `highlights`, `quickCommands`, `hiddenLevels`), allowed per area by the `allow_*` settings.
- Prism File Browser: `.../extensions/prism-files/preferences` (`view`, `showHidden`, `editor`, `keybinds`, `explorer`), edited in the editor's settings tab (`workbench/SettingsTab.tsx`); only values that differ from the admin defaults are stored. Allowed by `allow_editor_settings`.
- Prism Layout's collapsed sidebar is per browser in `localStorage['prism-layout:collapsed']`.

## Icons

Every extension draws Tabler icons through its generated `src/client/icons.tsx`: a `NamedIcon` that takes the Panel's lucide names and maps them via `scripts/tabler-icons.json`; unknown names fall back to the Panel's own `NamedIcon` (which shows a puzzle piece for names it does not know). Prism Layout and Prism Core get the whole map because they draw icons other extensions name. Regenerate with `node scripts/icons.mjs` after adding a name to the JSON.

## Surfaces and theming

- Prism Themes (`prism-themes/src/theme.tsx`) skins Panel primitives with classes: `Card`, `ListRow`, `Table`, `ChartCard`, `Stat` (tile variant) get `pt-surface`; `Dialog` root, `DropdownMenu` and the `Select` popup get `pt-surface pt-overlay`.
- Extensions put `pt-surface` on their own cards, rows and bars (prefixed Tailwind classes never match the theme's `.bg-card` rule), plus `pt-overlay` on popups, modals and sticky bars (they keep their own shadow under the flat and raised looks) and `pt-solid` on surfaces with their own fill (the console terminal stays opaque under glass). Prism Layout's bars use `pt-bar`.
- The look is chosen on `<html>`: `data-pt-surface` (flat, raised, outlined, glow, glass), `data-pt-font`, `data-pt-bg`, `data-pt-motion`, `data-pt-switches`, plus `--pt-*` tokens. `prism-themes/src/theme.css` maps the 19 palette roles (`d_*` dark, `l_*` light) to the Panel's tokens, including `--terminal-*` and `--editor-*`.
- Theme tokens are usually `oklch()` or `color-mix()`. Code that needs hex (Monaco) converts through a canvas: `prism-files/src/client/workbench/monaco.ts`.

## Background work: install plans and job progress

Prism MC, Prism Terraria and Prism Core Keeper run long tasks (installing versions, mods, modpacks, crossplay, updates) as an **install plan**: `src/Support/InstallPlan.php` builds a list of steps (`power`, `wait-offline`, `rename`, `delete`, `pull(s)`, `verify`, `unzip`, `write`, `property`, `yaml-set`, `record`, `forget`, …) with rollback steps, and `src/Jobs/RunInstallPlan.php` runs it in short slices on the `standard` queue, reporting through the Panel's `ExtensionJobProgress` (the client shows it with `components/JobProgress.tsx`). One plan per server at a time (cache lock, 1 hour).

Prism Schedules runs schedules as `ScheduleRun` records stepped by `src/Jobs/RunSchedule.php` on the same queue; `src/Console/TickCommand.php` (the Panel scheduler) starts due schedules and re-sends stuck runs.

Both need the Panel's queue worker. If work sits at "queued" or "running", check it first (`prism-deploy-and-test` skill).
