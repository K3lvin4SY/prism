<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Status" width="128" height="128">

# Prism Status

**A public status page at `/status` for the nodes and servers you choose, with uptime history and incident posts that can also show as the panel's announcement.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

- **The page** at `/status` on your panel: an overall line ("Everything is running"), the incidents going on, each node and server you chose with its state and a bar per day for the last 30, 60 or 90 days, and incidents resolved in the last two weeks. It follows the visitor's light or dark mode and refreshes itself every minute.
- **You choose what is shown**, and under which name, on the admin area's **Status page** page. Visitors see only those names: never a node's address, a server's id or anything else from the panel. Group them ("Game servers", "Infrastructure") and put them in order.
- **Checked once a minute.** A node is up while Wings answers; a server while it runs (starting counts as up). A node in maintenance mode, and the servers on it, show as planned maintenance and do not count against uptime. A server stopped on purpose shows as down, so add the servers that should always run.
- **Incidents**: a title, a kind (maintenance, minor incident, major outage), what it affects, and a series of updates (investigating, cause found, monitoring, resolved).
- **Prism Layout's announcement**: an incident can also show as the banner across the panel, linking to `/status`. Each update keeps it current. Resolving or deleting the incident takes it down and brings back the announcement you had before, unless someone changed it since.

The page is **off** until you turn it on in Prism Properties, so you can add components and try it first. It can also be limited to signed-in people.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Show the status page | Off | Off, `/status` shows nothing and checks stop; history and incidents are kept |
| Title | The panel's name + "status" | |
| Text under the title | Empty | Where else to find news, how to reach you |
| Uptime history | 90 days | 30, 60 or 90 |
| Show Prism Layout's logo | On | Above the title |
| Only for signed-in people | Off | Visitors are sent to the sign-in page first |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- The panel's scheduler, for the checks
- [Prism Layout](../prism-layout), only to show incidents as the announcement
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-status
npm install
npm run build     # the extension and the page itself (dist/status)
php artisan p:extension:install /path/to/prism-status --enable
```

The icon is a placeholder (the `activity` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
