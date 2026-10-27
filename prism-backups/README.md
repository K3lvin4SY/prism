<div align="center">

<img src="../assets/backup.png" alt="Prism Backups" width="128" height="128">

# Prism Backups

**Backup profiles that choose what gets backed up, browsing inside a backup, restoring single files and a .pteroignore editor.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Backups extends each server's Backups page. Save profiles that decide which files a backup includes, look inside any backup, and restore just the files you need instead of the whole server.

## Features

- **Backup profiles**: named sets of include and exclude patterns, picked when you make a backup.
- **Browse inside backups**: open a backup and look through its files.
- **Restore single files**: bring back one file or folder from a backup.
- **`.pteroignore` editor**: edit the server's ignore file with a tester that shows which paths it matches.
- **Owners only**: optionally give the extras to server owners only.

## Settings

| Tab | What it covers |
| --- | --- |
| General | Turn it on, owners only |
| Features | Profiles, browsing, single file restore, `.pteroignore` editor |
| Limits | Profiles per server, largest backup to browse, most data per restore, how long downloaded backups are cached |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-backups
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-backups --enable
```

## Development

| Command             | Purpose                 |
| ------------------- | ----------------------- |
| `npm run dev`       | Rebuild on every change |
| `npm run build`     | Build for production    |
| `npm run typecheck` | Check types             |
| `npm test`          | Run the tests           |

Deploy to a Panel running under Portainer from the repo root:

```bash
node --env-file=.env scripts/deploy.mjs --ext prism-backups
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
