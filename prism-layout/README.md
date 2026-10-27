<div align="center">

<img src="../assets/layout.png" alt="Prism Layout" width="128" height="128">

# Prism Layout

**Seven navigation layouts, server cards, branding, a custom sign-in page, announcements and a Ctrl+K command palette.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Layout changes how the Panel is laid out: the navigation, the dashboard and its server cards, your branding, and the sign-in page. It works with any theme, including [Prism Themes](../prism-themes).

## Features

- **Navigation layouts**: sidebar, top bar, dock, expandable dock, sidebar with top bar, rail, rail with top bar, or top bar with dock. Choose a separate layout for computers, tablets and phones.
- **Server cards**: rows or cards, status as a badge or dot, usage as bars or numbers, the game's logo or color, and power buttons on each card.
- **Dashboard**: an overview with filters above the server list.
- **Branding**: your own logo and favicon, the logo's size and where it sits.
- **Sign-in page**: several styles, your logo or a tagline beside the form.
- **Announcements**: a bar or card with a kind, audience, link, start and end time, and an optional close button.
- **Ctrl+K command palette**: jump to any server or page from the keyboard.
- **Extras**: page width and spacing, a light and dark switch, grouped server pages, a collapsible sidebar, footer links, and the admin area laid out to match.

## Settings

| Tab | What it covers |
| --- | --- |
| Navigation | Layout per device, sidebar width, dock magnify, grouping, server card in the sidebar, light and dark switch |
| Page | Page width and spacing |
| Server cards | Card style, status, usage, game logo or color, power buttons |
| Branding | Logo mode, placement and height |
| Sign-in page | Style, mark beside the form, logo size, tagline |
| Announcement | Message, kind, style, audience, link, schedule, dismissible |
| Links | Up to three footer links |
| Advanced | Ctrl+K command palette |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-layout
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-layout --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-layout
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
