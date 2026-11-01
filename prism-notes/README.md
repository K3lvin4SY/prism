<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Notes" width="128" height="128">

# Prism Notes

**Notes and checklists for each server, shared with its subusers.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Notes adds a **Notes** page to each server, for the things everyone who helps run it should know: "restart before updating mods", who to ask about the world, what to check after an update.

- **Notes** are written in a small markdown: **bold**, *italic*, `code`, lists, task lists, quotes, code blocks and links. Nothing written in a note is ever rendered as HTML, and only web and mail links are clickable.
- **Checklists** have up to 100 items. Anyone who may read notes can tick them, and each ticked item shows who ticked it.
- **Pinned notes** come first and are also shown above the console (the administrator can turn that off).
- Notes can have a color and be put in any order.
- Writing, changing and deleting notes is recorded in the server's activity log as `server:prism-notes.*`.

## Permissions

| Permission | What it allows |
| --- | --- |
| `ext.prism-notes.read` | See the server's notes and tick checklist items |
| `ext.prism-notes.manage` | Write, change, pin, reorder and delete notes (and see them) |

Server owners and admins have both.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Use notes | On | Off, the Notes page is hidden; notes already written are kept |
| Most notes a server may have | 50 | 1 to 200 |
| Show pinned notes above the console | On | Everyone who may read notes sees them there |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-notes
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-notes --enable
```

The icon is a placeholder (the `notebook-pen` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
