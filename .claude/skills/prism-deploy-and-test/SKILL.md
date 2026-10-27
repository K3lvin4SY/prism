---
name: prism-deploy-and-test
description: Build, deploy and test Prism extensions on the live Panel (panel.donkare.se via Portainer) - deploy.mjs, running PHP and shell in the Panel container, the mc-suite-test servers, testing in Chrome, checking the queue worker, and putting test data back. Load before deploying, verifying a change in the browser, or investigating something on the Panel.
---

# Deploying and testing Prism

## Before deploying

In the extension folder: `npx tsc --noEmit -p .` and `npx vitest run` (Prism Themes has no tests). Regenerate generated files first if their sources changed: `node scripts/icons.mjs`, `node scripts/shared.mjs`.

## Deploy

```bash
node --env-file=.env scripts/deploy.mjs --ext <folder>              # build, upload, php -l, install --enable --replace
node --env-file=.env scripts/deploy.mjs --ext <folder> --skip-build
node --env-file=.env scripts/deploy.mjs --ext <folder> --doctor     # also p:extension:doctor (manifest checks)
```

- `.env` holds `PORTAINER_API_TOKEN` (a Portainer access token; it acts as its owner, so no username is needed). `scripts/portainer.mjs` reaches the Panel container (`PORTAINER_URL`, `PORTAINER_ENDPOINT`, `PANEL_CONTAINER` have defaults).
- The folder name is the extension id. The last line of the output is the `p:extension:list` row: it should say `enabled` with no error.
- Deploy **prism-core first** when its manifest or the shared files change; every other extension requires it.
- After deploying, a page that was loaded mid-deploy can show a 404 or miss screens: reload.
- Releases: `.github/workflows/release.yml` builds every extension against the Panel tag in `PANEL_REF` and packages them with `scripts/pack.mjs` into `.pteroext` files.

## Running things on the Panel

```bash
node --env-file=.env scripts/run-php.mjs <file.php> [args]          # a local PHP file, run inside the container
node --env-file=.env scripts/portainer.mjs exec "<sh command>"      # a shell command
```

- A PHP script boots Laravel with `require '/app/vendor/autoload.php'; $app = require '/app/bootstrap/app.php'; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();`. `scripts/php/` has ready ones (`server-state.php`, `server-logs.php`, `inspect.php`, …); write new throwaway ones in the scratchpad, not the repo.
- Keep investigations read-only unless the change is the task. Writes on the Panel host (restarting services, deleting data) need the owner's go-ahead; the permission system may refuse them anyway.
- Useful reads: `php artisan p:extension:list`; the `extension_settings` table (`extension`, `key`, `value` as JSON); Prism tables (`prism_*`); `supervisorctl -c /etc/supervisord.conf status`.

### The queue worker

Install plans (MC, Terraria) and schedule runs need it. Symptoms of it being down: "Setting up …: queued" forever, schedule runs stuck on "running". Check with `supervisorctl -c /etc/supervisord.conf status queue-worker` and look at Redis queue lengths (`queues:standard`). It has been `FATAL` before; tell the owner to run `supervisorctl -c /etc/supervisord.conf start queue-worker` in the container (or restart it), do not restart it yourself.

## Test servers

| Server | Short id | Use |
| --- | --- | --- |
| mc-suite-test-fabric | `a3662484` | Minecraft Fabric, has Geyser/Floodgate and mods; general Prism testing |
| mc-suite-test-paper | `a2c27e65` | Paper (hex MOTD, plugins). **Do not change its MOTD.** |
| mc-suite-test-tshock | `9fcfbc9b` | Terraria TShock |
| mc-suite-test-terraria | `dba74775` | Terraria vanilla |
| mc-suite-test-tmodloader | `9f732e51` | tModLoader |
| mc-suite-test-corekeeper | `0ff17871` | Core Keeper (egg 27, port 25599). `scripts/php/corekeeper-state.php [dir \| cat <file>]`, `corekeeper-power.php`, `reinstall-corekeeper.php`; `run-corekeeper-plan.php <job>` runs one Prism Core Keeper plan when the queue worker is down. A world is only saved once a player has joined. |

There are also forge, bedrock, velocity and pumpkin test servers (see the dashboard). Fabric's MOTD is "A Minecraft Server".

## Testing in Chrome

- Load the Claude in Chrome tools in one ToolSearch call, get tab context, open your own tab, close it when done.
- Admin pages live under `/panel` (Prism Properties: `/panel/prism`); server pages under `/server/<shortId>/…`; extension screens at their manifest `path`.
- API calls from the page: `const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1])`, then `fetch(url, { headers: { 'X-XSRF-TOKEN': xsrf, Accept: 'application/json' } })`. Client API for extensions: `/api/client/servers/<shortId>/extensions/<id>/…`; admin: `/api/admin/extensions/<id>/…`; Panel files: `/api/client/servers/<id>/files/contents?file=…`.
- To try a theme look without changing it for everyone, set the `<html>` attribute (such as `data-pt-surface`) in your tab only.
- The preview window can be reached from the opener: `window.open('', 'prism-preview')` returns it (same origin).
- Avoid clicks that open browser dialogs (confirm/alert); they freeze the extension.
- Hidden elements (other mounted editors) may share labels; click by `find` reference or through page JavaScript.

## Cleaning up

- Put back every setting, preference and file changed for a test, and confirm the stored value afterwards (read `extension_settings` or the preferences endpoint).
- Discard unsaved drafts in Prism Properties, close the preview window.
- Note anything that could not be restored (for example a deleted jar) in the summary.
