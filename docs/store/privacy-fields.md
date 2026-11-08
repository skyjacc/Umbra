# Chrome Web Store privacy fields

Prepared 2026-11-08; submission recorded 2026-11-09 (Europe/Moscow). The text below is based on the inspected source and production 2.5.0 package; the previously installed store CRX was not independently compared byte-for-byte. The submitted dashboard disclosures have the four permission justifications saved, No remote code selected, Website content / Web history / Personal communications selected, and all three data-use certifications checked. Chrome Web Store shows 2.5.0 awaiting review; this is not approval.

## Single purpose

```text
Umbra EQ has a single purpose: to equalize and adjust the volume of the audio playing in the user's browser tabs, in real time.
```

## activeTab

```text
Umbra uses activeTab after the user invokes the extension to read the tab's URL, title and favicon URL. The URL is used to check whether capture is supported and to match the hostname against saved site rules; the title and favicon identify captured tabs in the interface. Umbra does not read page DOM content or the browser's history database. Audio capture is performed separately through tabCapture.
```

## tabCapture

```text
Umbra uses tabCapture to obtain the audio stream of a tab after the user invokes the extension for that tab. Each captured tab is processed by its own equalizer and played back locally in real time. Only audio is requested, not video or microphone input. Audio is held only in transient processing buffers; it is not saved as a recording or uploaded.
```

## storage

```text
Umbra uses chrome.storage.local to save the global EQ profile and chrome.storage.session to remember tabs the user stopped. Named presets and site rules, including saved hostname patterns, use chrome.storage.sync. If browser sync is enabled, Chrome may synchronize these settings across the user's devices. Umbra has no server and does not send these settings to its developer.
```

## offscreen

```text
Umbra uses a bundled offscreen document to consume tab audio streams and run the Web Audio processing and playback graph while the popup is closed. This work requires document APIs unavailable in the Manifest V3 service worker. The document is created for USER_MEDIA and AUDIO_PLAYBACK, uses only packaged scripts, and performs audio processing locally.
```

## Remote code

For the inspected production source and bundle: **No remote code**. JavaScript and the audio worklet are bundled locally; no remote executable loader was found. Chrome Sync transfers settings, not executable code. Reassess if future dependencies or code-loading behavior changes.

## Data-use categories — submitted selections and rationale

The selections below were checked in the actual dashboard before submission. The earlier pasted form alone did not preserve checkbox states. Google requires disclosure of data handling even when processing or storage stays local, so "the developer receives nothing" is not enough to declare no handled data. [User Data FAQ, especially questions 3 and 14](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

| Category | Submitted selection and rationale |
|---|---|
| Website content / Содержимое сайтов | Selected: the extension processes tab audio. The category explicitly includes sounds. No recording or upload is made. |
| Web history / История веб-поиска | Selected conservatively: tab URLs/titles are accessed, saved hostname rules can sync, and temporary diagnostic entries can contain full URLs. This does not mean the extension reads Chrome's history database. Google has no explicit ruling in the cited documentation for this exact combination of transient metadata and settings. |
| Personal communications / Личная коммуникация | Selected conservatively because tab playback can include conference-call audio, a category example. The previous listing advertised calls; removing that wording does not exclude their audio from the runtime. Only tab playback is processed, not microphone input. An explicit CWS interpretation of incidental call audio was not found; this selection is not a claim that call services were compatibility-tested. |
| Other listed categories | No dedicated collection of identity, medical, financial, authentication, location or user-interaction data was found in the inspected code. Do not infer these categories solely because arbitrary played audio could mention them. Reassess if integrations, accounts or analytics are added. |

This is a reasoned mapping to Google's categories, not a guarantee of a particular review outcome. The exact category wording is shown in Google's [privacy-fields documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) and its [data-use illustration](https://developer.chrome.com/static/docs/webstore/cws-dashboard-privacy/image/screenshot-data-certifi-1955439870c37.png).

All three certifications are checked in the submitted disclosures: no sale outside permitted cases, no unrelated uses, and no use for creditworthiness/lending. The reviewed code supports these statements. They are publisher declarations, not an SEO technique or evidence of review approval.

## Privacy-policy URL

```text
https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md
```

Before submission, verify that this public URL serves the revised policy. The policy explains Chrome Sync, transient processing buffers, URL/title access and in-memory diagnostic logs. Neither audio nor diagnostic logs are uploaded by Umbra.

## Why the previous wording needed changes

- `activeTab` grants temporary tab access; `tabCapture` provides the audio stream. Address/title access means "No browsing data is read" was too broad. [activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
- Presets and rules use `chrome.storage.sync`; "Nothing is uploaded" ignored browser-managed synchronization. [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Sounds count as website content in the disclosure form. "No page content is read" was therefore ambiguous even without DOM access.
- DSP uses temporary audio buffers. The accurate distinction is that audio recordings are not saved and audio is not uploaded.
- The in-memory diagnostic log can retain full tab URLs until entries are replaced or the corresponding context ends. `DEBUG = false` only disables console output.
