<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Discord" width="128" height="128">

# Prism Discord

**Discord messages when a server starts, stops or crashes, a backup finishes or fails, and players join or leave.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Discord adds a **Discord** page to each server. Each server can post to a few Discord webhooks, and each webhook picks what it posts:

| Event | How it is noticed |
| --- | --- |
| Server started, stopped, crashed | The server's state, checked once a minute. Going down is called a crash when nobody asked it to stop (no stop, kill or restart, and no stop command in the console, in the activity log), the same rule as Prism Schedules' crash trigger. |
| Backup finished, backup failed, install finished | Told to the panel by the node as they happen. |
| Player joined, player left | New console lines, read once a minute, for Minecraft Java and Bedrock, Factorio and Terraria. |

Messages are embeds with a color per event. Each webhook can have its own text per event with `{server}`, `{player}`, `{backup}` and `{event}`, and can mention one Discord role.

## How it stays safe

- Webhook addresses are stored encrypted and never sent back to the page; only a shortened form shows which webhook it is.
- Only Discord webhook addresses are accepted.
- Messages never mention anyone but the one role picked (`allowed_mentions`). Player and server names are escaped, so a name cannot format a message or mention anyone.
- Discord's rate limits are waited out. A webhook deleted in Discord shows an error on the page instead of being retried.
- Adding, changing and removing webhooks is recorded in the server's activity log as `server:prism-discord.*`.

## Permissions and settings

The subuser permission **Add, change and remove the server's Discord webhooks** (`ext.prism-discord.manage`) shows the Discord page. Server owners and admins have it.

| Setting | Default | What it does |
| --- | --- | --- |
| Send Discord messages | On | Off, nothing is sent and the Discord page is hidden; webhooks are kept |
| Player joins and leaves | On | Reading the console for players |
| Webhooks per server | 5 | 1 to 25 |

The minute check is `prism-discord:tick` on the panel's scheduler; messages go out through the panel's queue.

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- The panel's scheduler and queue worker running
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-discord
npm install
npm run build
php artisan p:extension:install /path/to/prism-discord --enable
```

The icon is a placeholder (the `message-circle` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
