<div align="center">

<img src="../assets/browser.png" alt="Prism File Browser" width="128" height="128">

# Prism File Browser

**A VS Code style editor with tabs, a trash bin, bulk actions, previews and an upload queue.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism File Browser replaces the Panel's file manager. Files open in a workbench built on Monaco, the editor behind VS Code, with tabs and a file tree. Deleted files go to a trash bin first, and uploads go through a queue.

## Features

- **Editor workbench**: Monaco with tabs, a file tree, minimap, sticky scroll, bracket colors, auto save and keybinds. Colors follow your theme.
- **Monaco on the edit page**: the Panel's own edit page uses the same editor.
- **File views**: list or grid, with previews for images and other files.
- **Bulk actions**: select many files to move, archive or delete together.
- **Trash bin**: restore deleted files for a set number of days.
- **Upload queue**: large uploads, several at the same time.
- **Hidden and protected paths**: glob patterns that hide files or stop them from being changed, enforced on the server, optionally for admins too.
- **Personal editor settings**: people can change their own editor settings and keybinds if you allow it.

## Settings

| Tab | What it covers |
| --- | --- |
| Features | Replace the file manager, workbench, Monaco edit page, trash, what opens first, default view |
| Editor | Theme, text size, tab size, wrap, minimap, sticky scroll, bracket colors, auto save, personal settings |
| Trash | How long deleted files are kept |
| Limits | Largest file to edit, largest upload, uploads at the same time |
| Paths | Hidden and protected paths |
| Keybinds | Default keybinds |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-files
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-files --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-files
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
