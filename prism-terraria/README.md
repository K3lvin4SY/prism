<div align="center">

<img src="../assets/terraria.png" alt="Prism Terraria" width="128" height="128">

# Prism Terraria

**Players, settings, versions, a world map, tModLoader mods and TShock plugins for Terraria servers.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Terraria adds Terraria tabs to every Terraria server. It detects whether the server runs vanilla Terraria, TShock or tModLoader and shows the tabs that fit.

## Features

- **Players**: who is online and their activity, read from the console and logs. On TShock, accounts, characters and bans too.
- **World**: a map of the world file.
- **Versions**: switch the Terraria, TShock or tModLoader release.
- **Properties**: the server's config in groups.
- **Mods**: browse and install tModLoader mods from the Steam Workshop.
- **Plugins**: browse and install TShock plugins.

## Detection

A server gets the tabs when its egg has one of the tags in the **Egg tags to detect** setting (`terraria, tria` by default).

## Settings

| Tab | What it covers |
| --- | --- |
| Server tabs | Show or hide each tab |
| Detection | Egg tags |
| Content | Confirm before installing |
| World | Largest world for the map |
| API keys | Steam Web API key (needed for Workshop mods) |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-terraria
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-terraria --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-terraria
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
