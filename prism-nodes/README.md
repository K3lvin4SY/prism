<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Nodes" width="128" height="128">

# Prism Nodes

**A health page for your nodes: Wings version and updates, host and server usage with history, maintenance mode, and moving servers to another node one at a time.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

The admin area's **Node health** page has a card for each node:

- **Wings**: whether it answers, its version, and a mark when a newer Wings is out (looked up on GitHub every six hours; this can be turned off).
- **The host**, as Wings reports it: system, kernel, CPU threads, memory, Docker version and how many containers run.
- **What the node gave its servers**: memory and disk against the node's limits, overallocation included.
- **What its servers use**: CPU, memory and disk added up over the node's servers every five minutes, with graphs of the last 24 hours. Wings reports what servers use, not the whole host, so this is not the host's load.
- **Maintenance mode**: a switch. While it is on, people cannot use the node's servers through the panel; the servers keep running. It is the panel's own setting, saved without asking Wings, and logged as an admin action.
- **Move servers…**: pick servers on the node and the node they go to. They move one at a time through the panel's own transfer (stopped, archived, copied), the next starting when the one before has finished. A server keeps its ports where they are free on the new node and gets free ones where not. Moves that have not started can be called off; a move that fails leaves the server where it was.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Keep usage history | On | Adds up what each node's servers use every five minutes; kept 7 days |
| Look for Wings updates | On | Asks GitHub for the newest Wings release every six hours |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- The panel's scheduler, for the history and the moves
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-nodes
npm install
npm run build
php artisan p:extension:install /path/to/prism-nodes --enable
```

The icon is a placeholder (the `server` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
