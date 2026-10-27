<div align="center">

<img src="../assets/key.png" alt="Prism Auth" width="128" height="128">

# Prism Auth

**Sign in with Google, Discord, Steam, GitHub or any OpenID Connect provider, and sign up with a confirmed email.**

![Pterodactyl](https://img.shields.io/badge/Pterodactyl-2.0-0e4688)
![Version](https://img.shields.io/badge/version-0.1.0-6b7280)
![PHP](https://img.shields.io/badge/PHP-8.3-777bb4)
![React](https://img.shields.io/badge/React-TypeScript-3178c6)
![Status](https://img.shields.io/badge/status-in%20development-orange)

</div>

---

## Overview

Prism Auth adds sign-in providers to the Panel's login page, a **Sign-in methods** page in account settings where people link and unlink providers, and optional sign-up with email confirmation.

## Features

- **Providers**: Google, Discord, Steam, GitHub and any OpenID Connect provider (Authentik, Keycloak, Entra ID, ...), added and ordered in Prism Properties.
- **Sign-in page**: provider buttons as rows or icons, with your own divider text.
- **Account linking**: link providers from the account page, or match accounts by email automatically, optionally including admins.
- **Sign-up**: let people create an account with a confirmed email, with username rules, name fields, password rules, allowed and blocked email domains, a terms page and an expiring confirmation link.
- **Spam protection**: a bot trap, Cloudflare Turnstile and a limit on sign-ups per network per hour.

## Settings

| Tab | What it covers |
| --- | --- |
| Sign-in | Button style, divider text |
| Accounts | Match by email, match admins, make an account on first sign-in |
| Sign-up | On or off, username, names, password rules, email domains, terms, bot trap, Turnstile, rate limit, link lifetime |
| Providers | The sign-in providers |

## Requirements

- Pterodactyl Panel `2.0` with extension SDK `>= 2.0.0-beta.6`
- PHP `8.3`
- [Prism Core](../prism-core) `>= 0.1.0`, installed first
- Node.js and npm, to build the extension

## Getting started

Build the extension against the SDK in the Panel source (`.panel/` at the repo root, see the [main README](../README.md)):

```bash
cd prism-auth
npm install
npm run build
```

Install it on the Panel:

```bash
php artisan p:extension:install /path/to/prism-auth --enable
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
node --env-file=.env scripts/deploy.mjs --ext prism-auth
```

---

<div align="center">
<sub>Part of <a href="../README.md">Prism</a>. Built for <a href="https://pterodactyl.io">Pterodactyl</a>.</sub>
</div>
