<div align="center">

<img src="../assets/placeholder.svg" alt="Prism Mail" width="128" height="128">

# Prism Mail

**Your logo, color and wording on the panel's emails, a test send for each of them, and a log of what was sent.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

- **One look for every email.** Your logo, a brand color for links and buttons, a heading, a sign-off and a footer. Prism Layout's logo is used when Prism Mail has none of its own and it is a PNG, JPG or GIF (mail clients rarely show SVG).
- **Your own wording** for each of the panel's emails on the admin area's **Emails** page: account created, password reset, added to or removed from a server, server installed, and the mail settings test. Change the subject, greeting, text above and below the button, and the button's label. Empty fields keep the panel's text. Placeholders such as `{name}`, `{username}`, `{email}`, `{server}` and `{panel}` are filled in for each person.
- **A live preview** beside the editor, filled with made-up details, and **Send me a test** to get the email in your own inbox.
- **A delivery log**: who each email went to, its subject, which email it was, and whether the mail server took it. Emails the mail server never took show as **Not confirmed** after ten minutes. The emails themselves are never kept: some carry password reset links.

Other extensions' emails, such as Prism Auth's sign-up confirmation, get the same look and are logged too.

## How it works

The panel draws every email through one view, `notifications::email`. Prism Mail puts its own view in front of it while the extension is enabled, and shows the panel's own view when **Brand the panel's emails** is off. A listener notes which notification is being sent, so the view knows which wording applies; the subject is changed just before the email leaves. Turning the extension off gives the panel's emails back unchanged.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Brand the panel's emails | On | Off, emails look and read as the panel sends them; your wording is kept |
| Brand color | `#3869d4` | Links and buttons; a hex color |
| Logo | None | PNG, JPG or GIF, up to 512 KB |
| Use Prism Layout's logo | On | When Prism Mail has no logo of its own |
| Heading | The panel's name | Beside or instead of the logo |
| Sign-off | `Regards,` | Above the panel's name at the end; empty leaves both out |
| Footer | A copyright line | Small print at the bottom |
| Keep a delivery log | On | Recipient, subject and status only |
| Keep log entries for | 30 days | 1 to 365 |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

```bash
cd prism-mail
npm install
npm run build
php artisan p:extension:install /path/to/prism-mail --enable
```

The icon is a placeholder (the `mail` icon in the manifest) until the extension has its own picture; then put an `icon.png` here and set `"icon": "icon.png"`.
