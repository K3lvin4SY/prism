---
name: prism-new-extension
description: How to build a new Prism extension, or add a screen, view override, route or setting to an existing one, the Prism way - manifest, PHP provider, routes, migrations, client entry, the shared settings store, generated icons, surfaces, Prism Core registration and the dependency on Prism Core. Load before creating an extension or wiring new UI into one.
---

# Building Prism extensions

The Panel's own guides are in `.panel/packages/sdk/README.md` (extensions) and `.panel/packages/sdk/THEMES.md` (themes, skins, views, primitives); the manifest schema is `.panel/packages/sdk/manifest.schema.json`. Read them for anything not covered here; never edit `.panel/`.

## Files of an extension (copy the shape of `prism-console`)

```
prism-<name>/
  extension.json        id, name, version, requires (panel, sdk, php?, extensions: prism-core), description, author, icon,
                        provider (PHP class), ui { entry: dist/client.js, mode: native, prefix: <3 letters>, screens? }
  composer.json         psr-4 "Prism<Name>\\": "src/", config.autoloader-suffix
  package.json          scripts build/dev/typecheck/test; dev deps like prism-console's; @tabler/icons-react
  vite.config.mjs       defineExtensionConfig({ entry: 'src/client/index.tsx' })   (from @pterodactyl/sdk/vite)
  vitest.config.mjs, tsconfig.json, postcss.config.mjs
  src/Prism<Name>Provider.php     extends Pterodactyl\Extensions\ExtensionProvider
  src/Http/Controllers/…, src/Support/…, src/Jobs/…, src/Console/…
  routes/admin.php | client.php | server.php
  database/migrations/…           tables named prism_<name>_*
  src/client/index.tsx, config.ts, styles.css, icons.tsx (generated), configStore.ts (generated)
```

- The **prefix** is unique per extension (taken: `ppx pla pcn pfl pdb pbk psc mcs trs pau`). `styles.css` imports Tailwind with it:
  `@import 'tailwindcss/theme.css' layer(theme) prefix(xyz); @import 'tailwindcss/utilities.css' layer(utilities) prefix(xyz); @import '@pterodactyl/sdk/theme.css'; @source './**/*.{ts,tsx}';`
- **Routes** are mounted by `registerApiRoutes()`: `admin.php` under `/api/admin/extensions/<id>`, `client.php` under `/api/client/extensions/<id>`, `server.php` under `/api/client/servers/{server}/extensions/<id>`. Check permissions in each controller (see how prism-mc's `authorizeFeature` and the Panel's server permissions are used); route model binding of Panel models needs care (take an int and `findOrFail`).
- **Settings** are registered in `boot()` with `$this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [Setting::make(...)…]))`. See the `prism-settings` skill.

## Client entry

```tsx
import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { configStore, setConfig } from './config';

export default definePterodactylExtension({
    setup({ config, views, screens, slots, forms }) {
        setConfig(config);
        views.override('page.server.console', { load: () => import('./views/ConsolePage').then(configStore.liveModule) });
        screens.register('players', () => import('./screens/PlayersScreen').then(configStore.liveModule), { visible: useVisible });
        slots.register('server.settings.after', configStore.live(SomeSlot));
    },
});
```

- `config.ts`: a pure `read(raw)` with fallbacks equal to the PHP defaults, then `export const configStore = createConfigStore('<id>', read)`, `setConfig`, `getConfig`, and `applyConfig` if a backend endpoint returns current settings. Never keep settings in a plain module variable: the live preview could not reach it.
- Everything registered is wrapped with `configStore.live` / `liveModule`; visibility predicates call `configStore.use()`.
- View names, slots and screen areas: `.panel/packages/sdk/views.json`, the README and THEMES.md. Screens declared in the manifest (`ui.screens`: id, area `server`/`admin`/…, path, nav label and icon) are registered by id in `setup`.

## Prism conventions

- **Depends on Prism Core**: `"requires": { …, "extensions": { "prism-core": ">=0.1.0" } }`.
- **Appears in Prism Properties**: add it to `PRISM` in `prism-core/src/client/api.ts` (and `PrismId`), hints in `hints.ts`, custom editors in `editors.tsx` if needed; it then also shows in Prism Export. Add a live preview home page in `HOMES` in `prism-core/src/client/preview.tsx` if it has its own page.
- **Shared generated files**: run `node scripts/shared.mjs` (configStore) and `node scripts/icons.mjs` (icons) after creating it; both scan every `prism-*` folder.
- **Icons**: `import { NamedIcon } from './icons'` (or `../icons`), lucide names mapped to Tabler in `scripts/tabler-icons.json`.
- **Surfaces**: cards, rows and bars get `pt-surface`; popups, modals and sticky bars also `pt-overlay`; boxes with their own fill `pt-solid`.
- **Panel components** come from `@pterodactyl/sdk` (`Button`, `Dialog`, `Select`, `Switch`, `Input`, `Badge`, `Alert`, `TitledGreyBox`, `ServerContentBlock`, `PageContentBlock`, `http`, `toast`, `httpErrorToHuman`, …). `Dialog` is `max-w-xl` with `Dialog.Footer` and `Dialog.Confirm`.
- **Text**: plain, friendly, "color" spelling; say what happens and what the person can do.
- **Background work** that outlives a request: a queued job reporting progress through `ExtensionJobProgress`, sliced so no run exceeds the queue timeout (see `InstallPlan`/`RunInstallPlan` in prism-mc and `RunSchedule` in prism-schedules).
- **README.md**: add the extension to the table.

## Checklist before calling it done

`npx tsc --noEmit -p .`, `npx vitest run`, deploy (`--doctor` for a new manifest), check it in Chrome, check it in Prism Properties and the live preview, put test data back, commit.
