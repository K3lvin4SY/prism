<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Satisfactory" width="128" height="128">

# Prism Satisfactory

**Players, mods from ficsit.app, public or experimental builds, server settings and new games for Satisfactory servers.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Satisfactory adds Satisfactory tabs to every Satisfactory server. It finds them by egg tag, by the Steam app id (1690800) or by the startup command, so the standard Satisfactory egg works without changes.

Satisfactory keeps most of its settings itself and changes them through its HTTPS API on the game port. Prism Satisfactory signs in to that API as the server's admin: set up a new server from Properties (name and admin password), or connect to one that has an admin. The password is kept encrypted.

## Features

- **Players**: how many are on (from the API) and who, from the joins in the server's log, with everyone seen before. The dedicated server has no kick or ban, so this is read only.
- **Mods**: search ficsit.app, the repository the Satisfactory Mod Manager uses, and install mods with the mods they need, each at the newest version with a Linux server build for the server's game build, checked against the repository's SHA-256. The Satisfactory Mod Loader comes along with the first mod. Turn mods off without removing them, and update them.
- **Versions**: switch between the public and experimental Steam builds.
- **Properties**: the server name, join and admin passwords, auto pause, autosaves, the daily restart, network quality and the egg's startup variables; start a new game at a chosen starting location, save, and pick the session that loads on start.

## Settings

| Tab | What it covers |
| --- | --- |
| Server tabs | Show or hide each tab |
| Detection | Egg tags (eggs installing app 1690800 are found anyway) |
| Mods | Confirm before installing |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension
- The Panel must reach the server's game port over HTTPS (the allocation's address, or the node's when that is 0.0.0.0)

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-satisfactory
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-satisfactory --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-satisfactory
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
