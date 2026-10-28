<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Share" width="128" height="128">

# Prism Share

**Guest links for a server: let someone watch the console, press chosen power buttons or download chosen files and backups, without an account.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Share adds a **Share links** page to each server. A link opens a page at `/share` that needs no account and shows only what the link allows. Each link has its own options, which can be changed while it is in use, and an expiry. Revoking a link disconnects anyone using it at once.

## What a link can allow

- **Watch the console**, with live CPU, memory and network use.
- **Send console commands** (off for every link unless the administrator allows it).
- **Start, stop and restart**, each on its own.
- **Download files** from the folders and files the link names.
- **Download backups**: the ones the link names. A backup is the way to share a whole world.

## How it stays safe

- **Never more than its maker.** Every option needs the matching panel permission (for example `control.restart` to share Restart). It is checked when the link is saved and again on every request, so whoever saved the link losing a permission takes it from the link too. Whoever saves a link vouches for it: they must be able to give every option on it.
- **The administrator decides what may be shared at all**, and for how long, in Prism Properties.
- **The token never reaches a server log.** Links look like `/share#<token>`; the token stays in the fragment, the page sends it in a header, and only its SHA-256 is stored. It is shown once, when the link is made.
- **The console is watch-only at the node.** The guest's Wings token only has `websocket.connect` and lasts five minutes. Commands and power go through the panel, which checks and records them. Revoking or changing a link calls the node's deauthorize, so open consoles drop at once.
- **Files stay inside what is shared.** Paths are normalized and must be inside a shared folder or file. Symlinks are hidden and refused, because Wings would follow them anywhere in the server.
- **Everything is recorded** in the server's activity log as `server:prism-share.*`: making, changing and revoking links, and each open, command, power action and download, with the link's name.
- Wrong tokens are rate limited per network address, and the page is sent with a strict Content Security Policy, `no-referrer`, `noindex` and `no-store`.

Known limits:

- Lowering the longest lifetime applies to new and changed links, not to links already made.
- A file is checked for symlinks just before its download link is made; a process on the server could swap it for a symlink in the moment between. Do not share folders the game server itself rewrites with links in them.

## Settings

| Tab | What it covers |
| --- | --- |
| General | On or off, the longest a link may last |
| What links may allow | Commands, power, files, backups |

The subuser permission **Make, change and revoke share links** (`ext.prism-share.manage`) shows the Share links page. Server owners and admins have it.

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-share
npm install
npm run build      # the Share links page, then the guest page into dist/share
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-share --enable
```
