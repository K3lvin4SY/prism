<div align="center">

<!-- Replace assets/icon.svg with the project icon. -->
<img src="assets/core.png" alt="Prism" width="128" height="128">

# Prism

**A suite of extensions for the Pterodactyl Panel: better tools for every server, plus built-in support for Minecraft, Terraria and Core Keeper.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism is a set of extensions for Pterodactyl Panel 2.0. Install only the ones you need. Every extension relies on **Prism Core**, which gives them all one shared settings page and a live preview.

## Extensions
 
| Extension                                    | Description                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| <img src="assets/core.png" width="20" height="20" align="center"> **[Prism Core](prism-core)**                 | Shared settings for every Prism extension on one admin page, with a live preview. Required by all other extensions.                              |
| <img src="assets/theme.png" width="20" height="20" align="center"> **[Prism Themes](prism-themes)**             | Colors for dark and light mode, type, shape, surfaces, backgrounds and motion. Includes presets such as Catppuccin, and you can add your own.    |
| <img src="assets/layout.png" width="20" height="20" align="center"> **[Prism Layout](prism-layout)**             | Seven navigation layouts, server card styles, announcements, a Ctrl+K command palette, custom logo and favicon, and a custom sign-in page.       |
| <img src="assets/console.png" width="20" height="20" align="center"> **[Prism Console](prism-console)**           | Console layouts, history, search, highlights, filters, exports and image pull progress.                                                          |
| <img src="assets/browser.png" width="20" height="20" align="center"> **[Prism File Browser](prism-files)**        | A VS Code style editor with tabs, a trash bin, bulk actions, previews and an upload queue.                                                       |
| <img src="assets/database.png" width="20" height="20" align="center"> **[Prism Database Manager](prism-database)** | Browse and edit tables, run SQL, import and export data, schedule backups and share a database between servers.                                  |
| <img src="assets/schedule.png" width="20" height="20" align="center"> **[Prism Schedules](prism-schedules)**       | Countdowns, waits, Discord messages, If/Else, crash and start triggers, conditions, presets, a week calendar and run history with live progress. |
| <img src="assets/backup.png" width="20" height="20" align="center"> **[Prism Backups](prism-backups)**           | Backup profiles that choose what gets backed up, browsing inside a backup, restoring single files and a `.pteroignore` editor.                   |
| <img src="assets/minecraft.png" width="20" height="20" align="center"> **[Prism MC](prism-mc)**                     | Players, a world map, versions, properties, plugins, mods and modpacks for Minecraft Java and Bedrock servers.                                   |
| <img src="assets/terraria.png" width="20" height="20" align="center"> **[Prism Terraria](prism-terraria)**         | Players, settings, versions, a world map, tModLoader mods and TShock plugins.                                                                    |
| <img src="assets/orb.png" width="20" height="20" align="center"> **[Prism Core Keeper](prism-corekeeper)**    | Players with their own pages, the shared Cartography Table map, mods from mod.io and the Steam Workshop, Steam builds (latest or legacy) and properties for Core Keeper servers.        |
| <img src="assets/key.png" width="20" height="20" align="center"> **[Prism Auth](prism-auth)**                 | Sign in with Google, Discord, Steam, GitHub or any OpenID Connect provider (Authentik, Keycloak, Entra ID, ...), and sign-up with a confirmed email. |
 

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- Node.js and npm, to build the extensions

## Getting started

The extensions build against the SDK that ships with the Panel source. Clone the Panel into `.panel/` first:

```bash
git clone https://github.com/pterodactyl/panel .panel
```

Build an extension:

```bash
cd prism-core
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-core --enable
```

Install **Prism Core** before any other Prism extension.

## Development

Each extension supports the same scripts:

| Command             | Purpose                 |
| ------------------- | ----------------------- |
| `npm run dev`       | Rebuild on every change |
| `npm run build`     | Build for production    |
| `npm run typecheck` | Check types             |
| `npm test`          | Run the tests           |

The [`scripts/`](scripts) folder holds helpers for deploying to a Panel running under Portainer, calling the Panel API and generating game data. For example:

```bash
PORTAINER_PASS=... node scripts/deploy.mjs --ext prism-files
```

## Project structure

```
prism/
├── prism-*/    Panel extensions
├── scripts/    Deploy, API and data generation helpers
└── .panel/     Pterodactyl Panel source (cloned separately, ignored by git)
```

---

<div align="center">
<sub>Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
