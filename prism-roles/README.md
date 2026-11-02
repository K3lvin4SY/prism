<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Roles" width="128" height="128">

# Prism Roles

**Reusable permission sets for subusers: pick a role instead of ticking boxes, change it once to update everyone who has it.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

- **Panel-wide roles** are kept by admins on the admin area's **Subuser roles** page. Viewer, Moderator and Builder come with it.
- **Your own roles** are kept on your account's **Subuser roles** page (the administrator can turn this off). Your helpers on your servers can pick your roles too.
- **Apply a role** sits above the permissions on a server's subuser form. Picking one ticks its permissions; saving links the subuser to the role.
- **Linked subusers follow their role.** Changing a role gives every linked subuser the new permissions. A subuser whose permissions were then changed by hand is marked **Changed by hand** and left alone, until someone gives them the role again from the **Roles** list on the Users page.

## How it stays safe

- A role never gives more than the person giving it holds. Applying a role on the form leaves out what you cannot give, as the panel's own form does.
- When a role changes, each linked subuser gets the new permissions capped by what **whoever gave them the role** holds on that server right then. If that person can no longer change the server's subusers, the subuser is left as they are and shows as **Behind the role**.
- Every change goes through the panel's own subuser action, so its checks, activity log and SFTP token revocation still happen.
- Deleting a role keeps everyone's permissions; only the links go.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Use subuser roles | On | Off, the picker and the roles pages are hidden; subusers keep their permissions |
| Users may save their own roles | On | Off, only the panel-wide roles can be used |
| Most roles a user may save | 20 | 1 to 100 |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-roles
npm install
npm run build
php artisan p:extension:install /path/to/prism-roles --enable
```

The icon is a placeholder (the `user-cog` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
