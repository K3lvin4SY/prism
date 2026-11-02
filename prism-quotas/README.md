<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Quotas" width="128" height="128">

# Prism Quotas

**Limits per user on servers, memory, disk, CPU, backups and databases, so people can create and delete their own servers within them.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

The panel lets only admins create servers. Prism Quotas gives everyone else a **Create a server** page on their account, within limits you set.

- **Limits** on the admin area's **Quotas** page: how many servers, and how much memory, disk and CPU in all, plus backups, databases and ports per server. Everyone shares the default limits; anyone can be given their own. The limits count every server the person owns, including ones an admin made.
- **What people may create**: the eggs on offer, each under a name people see, with the Docker image it runs and the locations it may go to. The egg's variables start at their defaults; people change the ones the egg allows on the server's Startup page.
- **Creating**: a name, the kind of server, a location, and memory, disk and CPU within what is left (at least 256 MiB memory, 1 GiB disk and 10% CPU). The panel's own create action picks a node in that location with room and a free port, installs the server and starts it. The limits are checked again on the server, one request per person at a time.
- **Deleting**: people may delete the servers they made on that page (not others), after typing the server's name, to free their quota again. This can be turned off.

Everything is off until you turn it on in Prism Properties, so you can set up the limits and offers first.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| People may create servers | Off | Shows the Create a server page |
| Who may | Everyone | Or only people given their own limits |
| People may delete servers they created | On | Only servers made on the Create a server page |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-quotas
npm install
npm run build
php artisan p:extension:install /path/to/prism-quotas --enable
```

The icon is a placeholder (the `gauge` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
