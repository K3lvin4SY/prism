<div align="center">

<img src="../assets/console.png" alt="Prism Console" width="128" height="128">

# Prism Console

**A better console for every server: layouts, history, search, highlights, filters, exports and image pull progress.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Console replaces the console page of every server. It keeps everything the Panel's console does and adds layouts, search, highlight rules, quick commands and live charts. Admins set the defaults; people can keep their own choices if you allow it.

## Features

- **Layouts**: several console layouts, full width or not, with or without the Panel's header.
- **Command history**: remembered per server and following people between devices.
- **Search and filters**: find text in the output and filter by log level.
- **Highlight rules**: color lines or words that match a pattern.
- **Quick commands**: buttons for commands you send often.
- **Export and copy**: save or copy the console output.
- **Live charts**: CPU, memory, disk and network next to the console.
- **Image pull progress**: a floating card showing progress while the server's image downloads.
- **Terminal settings**: font, text size, line height, line wrapping and timestamps.

## Settings

| Tab | What it covers |
| --- | --- |
| General | Width, header, progress card, lines kept, history size, which personal settings people may change |
| Layout | Default layout |
| Features | Search, filters, export, charts, quick commands, history sync, image pull progress |
| Terminal | Font, text size, line height, wrap, timestamps |
| Highlights | Default highlight rules |
| Quick commands | Default quick commands |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-console
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-console --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-console
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
