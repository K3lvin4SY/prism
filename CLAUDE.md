# Prism: Pterodactyl Panel 2.0 extensions

Ten extensions for Pterodactyl Panel 2.0 ("v2", SDK `>=2.0.0-beta.6`), each in its own `prism-*` folder, developed against the Panel source in `.panel/` (cloned separately, git-ignored, read only) and deployed to the live Panel at `panel.donkare.se`.

Load the matching skill before working in an area:

| Skill | Use it for |
| --- | --- |
| `prism-architecture` | How the extensions fit together: Prism Core, the shared settings store, the live preview, icons, surfaces, dependencies |
| `prism-deploy-and-test` | Building, deploying, running PHP on the Panel, the test servers, testing in Chrome, cleaning up |
| `prism-settings` | Every extension's settings (Prism Properties) and Prism Themes' theme settings, and how to add one |
| `prism-export-import` | Prism Export: the file format and what importing does |
| `prism-new-extension` | Adding an extension, a screen, a view override or a setting the Prism way |
| `prism-games` | Prism MC and Prism Terraria: detection, install plans, crossplay, players, maps, content |

## The extensions

| Folder | Id | Tailwind prefix | What it is |
| --- | --- | --- | --- |
| `prism-core` | prism-core | `ppx` | Prism Properties (admin page `/panel/prism`), Prism Export, the live preview. Required by all others. No PHP. |
| `prism-themes` | prism-themes | – | A theme (not a normal extension): palettes, type, surfaces, backgrounds, presets. |
| `prism-layout` | prism-layout | `pla` | Navigation layouts, server cards, branding, sign-in page, announcements, Ctrl+K. |
| `prism-console` | prism-console | `pcn` | The console page. |
| `prism-files` | prism-files | `pfl` | File manager and the Monaco editor workbench. |
| `prism-database` | prism-database | `pdb` | Database manager. |
| `prism-backups` | prism-backups | `pbk` | Backup profiles, browsing, single-file restore, `.pteroignore`. |
| `prism-schedules` | prism-schedules | `psc` | Schedules engine with its own runs and history. |
| `prism-mc` | prism-mc | `mcs` | Minecraft Java/Bedrock: players, world map, versions, properties, plugins, mods, modpacks, crossplay, proxy. |
| `prism-terraria` | prism-terraria | `trs` | Terraria/TShock/tModLoader. |

Every extension's `extension.json` has `requires.extensions: { "prism-core": ">=0.1.0" }`; the Panel enables Core first and refuses to disable it while others need it.

## Ground rules

- **Do not delete anything you did not create, and do not edit anything you did not write.** `.panel/` is the Panel's source: read it, never change it. On the live Panel only touch Prism's own data.
- **Commit on `main`** when a piece of work is done and verified, ending the message with the attribution line the session gives. Keep separate pieces of work in separate commits when asked.
- **Test, then put test data back.** Settings, preferences, MOTDs, uploaded test files: restore them afterwards. Never change the Paper test server's MOTD (the owner set it).
- **Ask before** activating Prism Themes for everyone, deleting panel extensions or data, or anything outward-facing.
- **Write "color"**, never "colour", in code and UI text.
- **Icons are Tabler.** Use `NamedIcon` from each extension's `src/client/icons.tsx` (generated), never the SDK's `NamedIcon` directly; add new names to `scripts/tabler-icons.json` and run `node scripts/icons.mjs`.
- **Generated files** (`src/client/icons.tsx`, `src/client/configStore.ts`, `prism-themes/src/configStore.ts`) are never edited by hand: change `scripts/tabler-icons.json` or `scripts/shared/*`, then run `node scripts/icons.mjs` / `node scripts/shared.mjs`.

## Everyday commands

```bash
# in an extension folder
npx tsc --noEmit -p .      # type check
npx vitest run             # tests (prism-themes has none)
npm run build

# from the repo root
node --env-file=.env scripts/deploy.mjs --ext prism-mc            # build, upload, lint PHP, install, enable
node --env-file=.env scripts/deploy.mjs --ext prism-mc --doctor   # also run p:extension:doctor
node --env-file=.env scripts/run-php.mjs scripts/php/server-state.php   # run a PHP file inside the Panel
node --env-file=.env scripts/portainer.mjs exec "cd /app && php artisan p:extension:list"
```

Deploy `prism-core` before the others when its manifest or shared code changes.

## Gotchas worth knowing

- **Tailwind v4 with a prefix per extension** (`mcs:flex`, `ppx:p-4`, …). Global CSS such as `.bg-card` never matches a prefixed class. Unlayered CSS beats utilities.
- **Settings reach the browser only with `->frontend()`**; color settings must be hex or `oklch()`; Laravel trims request strings (leading spaces are lost unless sent separately).
- **Theme tokens are often `oklch()`/`color-mix()`**: anything needing hex (Monaco) must convert, see `prism-files/src/client/workbench/monaco.ts`.
- **Background work runs on the Panel's queue** (`standard`, Redis). If install plans or schedule runs sit at "queued"/"running", check `supervisorctl -c /etc/supervisord.conf status queue-worker` in the container; it has been FATAL before and only the owner may restart it.
- **Shell editing on Windows**: heredocs mangle backslashes and quotes in code. Write a Python or PHP script to the scratchpad and run it, or use the Edit tool.
- **Chrome testing**: open your own tab, take the XSRF token from the `XSRF-TOKEN` cookie for API calls, and avoid anything that raises a browser dialog.
