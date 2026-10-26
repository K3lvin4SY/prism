---
name: prism-export-import
description: Prism Export in Prism Properties - what an export file contains, its JSON format, what importing changes and skips, and how to keep it working when settings or extensions change. Load when touching export/import, adding settings that should travel between panels, or helping move settings to another panel.
---

# Prism Export and Import

Prism Properties (`/panel/prism`) has an **Export and import** entry (`prism-core/src/client/ExportImport.tsx`, entry id `prism-export`) with two sections, **Export** and **Import**. It moves the admin's saved settings of every installed Prism extension, and Prism Themes, to a file and back, on the same panel or another.

## What is exported

- One section per installed, enabled Prism extension that registers settings (the `PRISM` list in `prism-core/src/client/api.ts`), plus **Prism Themes** (`prism-themes`) when the theme is installed.
- Every setting **except files**: `field: 'file'` settings (Prism Layout's logo, square logo, favicon, card picture, sign-in picture) and Prism Themes' `background_image` are left out. Pictures stored by extensions themselves (Prism Layout egg pictures and logos, server pictures) are not settings and are not exported either.
- **Saved** values only; unsaved drafts in the editors are not included.
- Secrets (`password` fields such as `pumpkin_market_key`, `steam_api_key`, `turnstile_secret`) come back from the Panel as a mask, so the file holds the mask, never the key.
- Prism Auth's sign-in providers are not settings (they are rows with encrypted client secrets) and are not exported; set them up again on the other panel. Its `providers` setting is an empty placeholder for the editor.
- Prism Themes' `presets` setting (the admin's own presets as JSON) is a normal setting, so custom presets travel with an export.
- People's personal preferences (console, editor) are per user and are not part of an export.

The admin picks which sections to include; the download is `prism-settings-YYYY-MM-DD.json`.

## File format

```json
{
  "prismExport": 1,
  "exportedAt": "2026-10-26T12:00:00.000Z",
  "panel": "panel.example.com",
  "sections": {
    "prism-layout": { "name": "Prism Layout", "settings": { "bars": "sidebar", "cards": "rows", "egg_colors": "logo" } },
    "prism-themes": { "name": "Prism Themes", "settings": { "d_primary": "oklch(0.7 0.15 255)", "surface_style": "raised" } }
  }
}
```

`prismExport` must be `1`. Keys inside `settings` are each setting's `input` name (the same as its key for every Prism setting).

## What importing does

1. The file is read in the browser and checked (`prismExport === 1`, `sections` an object); anything else is refused with "This is not a Prism export file."
2. For each section it shows the **changes** against the current saved settings (label, old → new), how many keys it does not know (skipped), and whether that extension is installed here. Sections for extensions not installed cannot be applied.
3. The admin picks sections and applies. For each picked section only the **changed** settings are sent:
   - extensions: `PATCH /api/admin/extensions/<id>/settings` (the Panel validates each value with the setting's rules, so a bad value stops the import with the Panel's message), then the refresh endpoint where one exists (Prism Layout);
   - Prism Themes: saved through the theme settings API (`themeApi.save`).
4. A result list says what changed per section, or where it stopped. Sections already applied stay applied.

Nothing is activated: importing Prism Themes settings does not activate the theme.

## Keeping it working

- New settings are included automatically once they are in the extension's schema (non-file). Give them sensible validation rules: import relies on them.
- Renaming or removing a setting key makes older files report it as unknown and skip it. If a key must change, read the old one as a fallback in `config.ts` and in PHP for a while.
- A new extension appears in export/import once it is in `PRISM` (Prism Core) and registers settings.
- Changing the format means raising `prismExport` and still reading `1`.
