# Umbra Chrome Web Store copy

**Status recorded 2026-11-09 (Europe/Moscow): 2.5.0 submitted; awaiting Chrome Web Store review.** The dashboard confirmed submission; the public version remains 2.4.1. Automatic publication was unchecked, so 2.5.0 must be published manually after approval, within the 30-day window shown by the UI. Three global English and three localized Russian cards were uploaded in EQ → Rules → Presets order, saved and verified after reload. Submitted privacy selections are Website content, Web history and Personal communications, with four permission justifications, No remote code and all three data-use certifications. Package checks and the submission record are in [validation-2.5.0.md](validation-2.5.0.md). Submission is not approval or publication.

## Text to use

| Dashboard field | Source |
|---|---|
| English title and summary | `public/_locales/en/messages.json`: `extensionName`, `extensionDescription` |
| Russian title and summary | `public/_locales/ru/messages.json`: the same message keys |
| English detailed description | [en-description.txt](en-description.txt) |
| Russian detailed description | [ru-description.txt](ru-description.txt) |
| Single purpose and permission explanations | [privacy-fields.md](privacy-fields.md) |
| Screenshot plan and dimensions | [assets-brief.md](assets-brief.md) |
| Russian step-by-step submission guide | [submit-2.5.0.ru.md](submit-2.5.0.ru.md) |
| Release notes | [release-notes-2.5.0.md](release-notes-2.5.0.md) |
| Package hash, release checks and limits | [validation-2.5.0.md](validation-2.5.0.md) |

The manifest uses localized message references and `default_locale: en`. Both `_locales/en` and `_locales/ru` must be present in the ZIP. The English title remains **Equalizer + Bass Boost, per Tab — Umbra EQ**. No rename experiment is bundled with this copy revision. The Russian title is **Эквалайзер и усиление баса — Umbra EQ**.

The two descriptions describe the same functionality. The package already has an English/Russian interface; these manifest locales additionally make the store's localization controls available. Package metadata does not automatically fill the dashboard's detailed descriptions or localized screenshots. Paste each text into its corresponding language after uploading the package. The in-app language selector remains independent of the browser's language.

## Scope of this copy

The old description was 4,467 characters and used the word `equalizer` 21 times. The new copy removes repeated paragraphs and unsupported comparisons with other extensions. It describes per-tab audio, presets and site rules directly. It does not advertise proposed Night, headphone AutoEQ, automatic loudness leveling or voice separation as existing features.

Audio processing stays on the device. That is different from saying all data always stays on the device: saved presets and hostname rules can use Chrome Sync. Tab information and temporary local diagnostics are explained in the privacy policy. The term "no analytics" refers to the extension itself; store-provided listing analytics are separate.

## Applying the materials

1. Verify the public policy at `https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md` matches the revised local policy. Editing a local file does not update that public URL.
2. Complete the normal release checks and upload the 2.5.0 ZIP. Keep the existing item ID.
3. Select English and Russian separately and paste their descriptions. Add screenshots of the shipped UI in the matching language.
4. Confirm the saved permission explanations and data-use selections against [privacy-fields.md](privacy-fields.md). Its current-state record comes from the dashboard, not the old plain-text form that omitted checkbox states.
5. Keep the real product status: free while no paid features exist, publicly available, and distributed in the regions the developer intends to support. Country lists alone do not prove that every country is selected. Do not remove countries based on one month's install pattern.
6. Record the date and what was changed. Compare the same date range and attribution definitions before drawing conclusions from store analytics.

For a later GitHub repository-description update, use this factual draft:

> Per-tab parametric equalizer, bass boost and volume control for Chromium browsers. Site profiles, local audio processing and open-source code.

This is a suggested repository description, not an applied GitHub setting.

## Official references

- [Creating a great listing](https://developer.chrome.com/docs/webstore/best-listing): clear title, useful summary, accurate feature descriptions.
- [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements): accurate metadata and no keyword spam.
- [Localized listings](https://developer.chrome.com/docs/webstore/cws-dashboard-listing): locales, descriptions and graphic assets.
- [Manifest name](https://developer.chrome.com/docs/extensions/reference/manifest/name) and [description](https://developer.chrome.com/docs/extensions/reference/manifest/description): 75 and 132 character limits respectively.
