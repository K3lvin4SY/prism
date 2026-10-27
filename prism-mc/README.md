<div align="center">

<img src="../assets/minecraft.png" alt="Prism MC" width="128" height="128">

# Prism MC

**Players, a world map, versions, properties, plugins, mods and modpacks for Minecraft Java and Bedrock servers.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism MC adds Minecraft tabs to every Minecraft server. It detects the edition (Java or Bedrock), the server software (Paper, Purpur, Fabric, Forge, NeoForge, Quilt, Velocity, BungeeCord, Pumpkin, ...) and the game version, and shows only the tabs that make sense for that server.

## Features

- **Players**: online and known players with 3D skins. Each player has a page with their inventory, ender chest, advancements and actions: gamemode, XP, heal, kick, teleport, op, whitelist and ban. Offline inventories can be edited.
- **World**: a map drawn from the world's region files, with player markers.
- **Versions**: switch the server software and game version.
- **Properties**: `server.properties` in groups, and a MOTD editor with color codes, hex colors and gradients.
- **Plugins and mods**: search Modrinth and Pumpkin Market, pick a version, install dependencies and manage what's installed.
- **Modpacks**: install Modrinth modpacks.
- **Crossplay**: install and update Geyser and Floodgate so Bedrock players can join, or turn on Pumpkin's own Bedrock support.
- **Proxy networks**: link servers to a Velocity or BungeeCord proxy and set up forwarding.
- **PatchBukkit**: Bukkit plugins on Pumpkin.

Installs run as plans on the Panel's queue with progress, checksum checks and rollback.

## Detection

A server gets the tabs when its egg has one of the tags in the **Egg tags to detect** setting (`minecraft` by default). Admins can also force or turn off detection per egg with the **Prism MC server type** field on the egg form.

## Settings

| Tab | What it covers |
| --- | --- |
| Server tabs | Show or hide each tab |
| Detection | Egg tags |
| Features | Crossplay, proxy networks, 3D skins, PatchBukkit |
| Content | Confirm before installing, snapshots, Pumpkin Market, largest modpack |
| Status | Status ping timeout |
| API keys | Pumpkin Market API key |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-mc
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-mc --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-mc
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
