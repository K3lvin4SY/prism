<div align="center">

<img src="../assets/core.png" alt="Prism Core" width="128" height="128">

# Prism Core

**Prism Properties: one admin page for every Prism extension's settings, with a live preview.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Core is the base of the Prism suite. It adds **Prism Properties**, an admin page at `/panel/prism` where the settings of every installed Prism extension live side by side, and a live preview that shows a change before you save it. Every other Prism extension requires it.

## Features

- **Prism Properties**: one page with a tab for each installed Prism extension, grouped into sections, with units, ranges and editors for structured settings (highlight rules, quick commands, keybinds, sign-in providers, ...).
- **Live preview**: open the Panel in a preview window and watch unsaved changes apply as you make them.
- **Themes**: pick a built-in preset (such as Catppuccin) or save your own, and edit Prism Themes' colors, type, surfaces and backgrounds.
- **Branding and pictures**: preview your logo and favicon, and upload a logo per egg for server cards.
- **Prism Export**: save every Prism setting to a JSON file and import it on another Panel. Secrets such as API keys are never exported.

## Settings

Prism Core has no settings of its own. It is where the settings of all the other extensions are edited.

> Install Prism Core before any other Prism extension. The Panel will not disable it while another Prism extension needs it.

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-core
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-core --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-core
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
