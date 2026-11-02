<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Audit" width="128" height="128">

# Prism Audit

**Everything that happens on the panel as one readable timeline, with filters, CSV export, and alerts on risky things such as an admin signing in from a new address.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

- **One timeline** on the admin area's **Audit** page: sign-ins, account changes, everything done on every server, admin actions and other extensions' events, newest first and grouped by day. Each entry reads as a sentence ("steve ran a command: say hi") with its server, IP address and time; open it for the raw details.
- **Filters**: sign-ins, accounts, servers, admin or extensions; one event; who did it or who it was about; one server; an IP address; a date range; and free text that also searches commands, file names and emails. Click a name, server or address in the timeline to filter by it.
- **CSV export** of whatever the filters show, up to 50,000 rows.
- **Alerts**, checked once a minute:
  - an admin (or anyone, if you choose) signs in from an IP address they have not used lately
  - many failed sign-ins from one address in a short time
  - someone turns off two-factor authentication on their account
  - chosen admin actions, such as deleting a server, user or node, or creating an admin API key

  Alerts show at the top of the Audit page, and can also be emailed to every root admin or posted to a Discord, Slack or Mattermost webhook.

Prism Audit reads the panel's own activity log; it keeps no copy. The panel prunes that log after 90 days by default (`APP_ACTIVITY_PRUNE_DAYS`), so the timeline goes back that far. Alerts keep their own text and are removed after a year.

"New address" means a new IP address. Prism Audit does not look up where an address is, so nothing is sent to a third party. Behind a reverse proxy the panel must trust the proxy, or every visitor has the proxy's address and this rule has nothing to compare.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Alert on risky activity | On | Off, no rules run; the timeline stays |
| Sign-ins from a new address | On | |
| Watch sign-ins of | Admins | Or everyone |
| An address is new after | 90 days | Days without a sign-in from it |
| Many failed sign-ins | On | |
| Failed sign-ins / Within minutes | 10 in 10 | Raised once per address in that time |
| Two-factor turned off | On | |
| Admin actions | Delete a server, user or node; create an admin API key; turn off a user's two-factor | Any of these by any admin raises an alert |
| Email the admins | Off | Every root admin gets each alert |
| Post to a webhook / Webhook address | Off | An https incoming webhook, stored encrypted |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- The panel's scheduler, for the alerts
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-audit
npm install
npm run build
php artisan p:extension:install /path/to/prism-audit --enable
```

The icon is a placeholder (the `history` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
