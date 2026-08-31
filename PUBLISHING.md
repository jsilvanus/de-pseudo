# Publishing to the Chrome Web Store and Edge Add-ons

This is human work — a developer account, identity, and (for Chrome) a payment are required, none of which an automated session can do. This doc is the checklist and link set for whoever does it.

Both stores accept the **same built package** — there is no separate "Edge build." Build once, submit the same zip to both:

```bash
npm run build:extension
cd dist-extension && zip -r ../de-pseudo-extension.zip . && cd ..
```

Zip the *contents* of `dist-extension/`, not the folder itself — `manifest.json` must sit at the zip's root.

## Before submitting to either store

- [ ] **Privacy policy page.** Both stores require one for an extension that requests host permissions the way this one does (`optional_host_permissions` for the AI chat sites), even though de-pseudo collects and transmits nothing itself. The README's "central privacy boundary" paragraph is the right starting content — it just needs to live at a public URL (e.g. a page alongside the deployed app, or a linkable file in this repo) before either submission form will accept it.
- [ ] **Screenshots.** Neither store lists an extension without at least one. None exist yet beyond the demo artifact from this session — worth generating store-sized ones (1280×800, Chrome's preferred size) the same way: build the extension, drive it with Playwright, screenshot the real side panel.
- [ ] **Permission justifications**, since both submission forms ask for one per permission. Drafts, matching what's actually implemented (see `BROWSER-EXTENSION-PLAN.md`):
  - `sidePanel` — shows the extension's UI as a side panel instead of a popup, so it can stay open next to an AI chat tab.
  - `scripting` — used only when the user clicks "Send to AI chat tab" or "Capture reply from AI chat tab", to fill or read the compose box on a page the user has explicitly granted access to; never runs automatically or in the background.
  - Host permissions for `chatgpt.com`, `chat.openai.com`, `claude.ai`, `copilot.microsoft.com`, `m365.cloud.microsoft`, `gemini.google.com` — requested at runtime (not at install) the first time the user uses either chat-bridge button; used only to locate that page's message box and latest reply.
- [ ] **Version.** The zip's `manifest.json` version is generated from `package.json` at build time (`vite.config.extension.ts`'s manifest plugin) — bump `package.json`'s version before building a release, not the manifest directly.

## Chrome Web Store

1. Register a developer account — a one-time **US$5** fee tied to the Google account, not per extension; 2-Step Verification must be enabled first.
   [Register your developer account](https://developer.chrome.com/docs/webstore/register) · [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)
2. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) → **New Item** → upload the zip.
3. Fill in the store listing (description, category, screenshots).
   [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing) · [Image requirements](https://developer.chrome.com/docs/webstore/images)
4. Complete the mandatory **Privacy** tab (data-use disclosure + privacy policy URL) — required given the permissions requested, even though the honest answer to most of the data-collection questions is "no."
   [Privacy Policy & secure handling requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
5. Read before submitting: [Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/), [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq). Pay particular attention to the "single purpose" and "narrowest permissions" rules — this extension was deliberately built with a minimal permission set for exactly this reason (see `BROWSER-EXTENSION-PLAN.md`), which should make this part straightforward.
6. Submit for review. No fixed SLA; commonly a few days, longer for extensions requesting `scripting`/host permissions like this one — don't plan around same-day approval.

## Edge Add-ons

1. Register as a Microsoft Edge extension developer via Partner Center — **no fee**.
   [Register as a Microsoft Edge extension developer](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)
2. Submit the **same zip** built for Chrome — Partner Center converts it to `.crx` automatically, no repackaging needed.
   [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
3. Read before submitting: [Developer policies for the Microsoft Edge Add-ons store](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies). The submission's Privacy page must stay accurate and consistent with actual behavior — same spirit as Chrome's disclosure step.
4. Submit for certification. Historically faster than Chrome's review, but not guaranteed — don't assume it.

## After either store approves

- Update `README.md`'s install instructions to link the live store listing(s), alongside or instead of the current "load unpacked" instructions.
- Neither store watches this repo or auto-publishes. Each future release is manual: bump `package.json`'s version, rebuild, re-zip, upload as a new version in each dashboard separately.

## Sources

- [Register your developer account](https://developer.chrome.com/docs/webstore/register)
- [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)
- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Supplying images](https://developer.chrome.com/docs/webstore/images)
- [Privacy Policy & secure handling requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/)
- [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- [Permissions reference (warning text per permission)](https://developer.chrome.com/docs/extensions/reference/permissions-list)
- [Register as a Microsoft Edge extension developer](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)
- [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Developer policies for the Microsoft Edge Add-ons store](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
