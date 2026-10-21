# MC Suite

A Pterodactyl panel extension, scaffolded by `p:extension:make`.

## Layout

- `extension.json`: the manifest; `provider` is the boot entry point.
- `src/`: PSR-4 PHP (`McSuite\`), booted through `src/McSuiteProvider.php`.
  Runs fully trusted, in-process, with the same middleware stacks core uses.
- `composer.json`: the PSR-4 map the panel and your editor read. Composer
  dependencies go here too; the panel loads `vendor/autoload.php` when it exists.
- `routes/client.php`: mounted at `/api/client/extensions/mc-suite`. Add
  `routes/admin.php` / `routes/application.php` for the other API surfaces.
- `database/migrations/`: extension-owned migrations. Prefix tables with
  `ext_mc-suite_` by convention.

## Frontend

The UI entry (`src/client/index.tsx`) is compiled against `@pterodactyl/sdk` to a
single prebuilt ESM file — the panel dynamic-imports it at boot and resolves
React, TanStack Query, and the SDK through its import map, so the bundle stays
tiny and shares the panel's runtime.

```sh
npm install
npm run build        # or: npm run dev (rebuild on change)
npm run typecheck
npm test
```

`dist/client.js` must exist before the extension is enabled; it is published to
`/assets/extensions/mc-suite/` on install/enable.

A `file:` SDK dependency is a link into the panel checkout. `preserveSymlinks` in
`tsconfig.json` makes the SDK's types use this package's React and TanStack Query
instead of the panel's copies; keep it.


Screen metadata is declared in `extension.json` under `ui.screens`. The client entry registers the implementation with `screens.register('main', importer)`. Keep both IDs in sync. The panel renders while extensions load; errors and loading are isolated per mount. Reload the panel after enabling, disabling, updating, or changing extension configuration.

Tests use the real SDK with `createExtensionTestHost`, including the host query cache,
router, permissions, and websocket events. CI runs types, tests, and a production build.

To generate a client for this extension, export its routes from the panel after Scribe
generation, then run the generator in this package:

```sh
php /path/to/panel/scripts/generate-extension-openapi.php mc-suite /path/to/panel/storage/app/private/scribe/openapi.yaml /path/to/mc-suite/openapi.yaml
npm run api:generate
```

The generated client uses `@pterodactyl/sdk/api` and the panel's shared authentication
and transport. Commit generated sources and the OpenAPI input with your extension.
Use `p:extension:doctor`, `p:extension:dev --watch`, and `p:extension:pack` from the panel
for validation, successful-build publishing, and runtime-only packaging.

`src/client/styles.css` compiles Tailwind with this extension's own prefix, `mcs`
(`ui.prefix` in `extension.json`), and without resetting the panel, so its utilities never
collide with the panel's or another extension's: write `mcs:flex`, `mcs:lg:hidden`,
`mcs:hover:bg-accent`, `mcs:mt-4!` and `@apply mcs:flex`. Unprefixed classes are not in
the extension's stylesheet, and `p:extension:doctor` and the installer reject a build whose
prefix is not the declared one. The SDK theme maps the same live tokens as core, so use
`mcs:bg-card`, `mcs:text-foreground`, and `mcs:border-border` instead of palette
colors. Pass `prefix: 'mcs'` to the SDK test hosts when a test asserts merged classes.
CSS loads before extension setup.

Run `php artisan p:extension:types /path/to/mc-suite` to generate literal screen ids and
configuration keys after loading the provider. Declare frontend settings with
`->frontend()->frontendType('string')` and add `->public()` to those guests may read; use
`defineConfiguredExtension` with a runtime
parser and the generated types. Secret definitions use `->secret()` and stay backend-only.
## Develop

```sh
php artisan p:extension:dev /path/to/mc-suite --enable
```

This builds the extension, installs it from where it is and enables it; `--watch` republishes each
change. Package for distribution with `p:extension:pack`, after building `dist/` and, if
the extension has Composer dependencies, running
`composer install --no-dev --optimize-autoloader`:

```sh
php artisan p:extension:pack /path/to/mc-suite
```
