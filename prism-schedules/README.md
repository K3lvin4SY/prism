<div align="center">

<img src="../assets/schedule.png" alt="Prism Schedules" width="128" height="128">

# Prism Schedules

**Countdowns, waits, Discord messages, If/Else, crash and start triggers, conditions, presets, a week calendar and run history.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Schedules is a schedules engine for every server. Schedules are built from steps, run on the Panel's queue, and keep a history of every run with live progress.

## Features

- **Steps**: commands, power actions, backups, waits, countdowns that warn players, and Discord messages.
- **If/Else and conditions**: run steps only when a condition holds, such as the server being online.
- **Triggers**: a time, or when the server starts, stops, crashes or becomes empty.
- **Presets**: ready-made schedules such as a daily restart with warnings, crash recovery or an hourly backup.
- **Week calendar**: see when every schedule runs.
- **Run history**: each run's steps, output and live progress.

## Settings

| Tab | What it covers |
| --- | --- |
| General | Turn it on, which view shows first |
| Features | Discord messages, start/stop/crash triggers, "server is empty" trigger |
| Limits | Schedules per server, steps per schedule, how long run history is kept |

> Schedule runs use the Panel's queue worker. If runs stay at "queued", check that the worker is running.

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-schedules
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-schedules --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-schedules
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
