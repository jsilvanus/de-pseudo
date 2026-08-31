# Browser Extension Feasibility & Plan

## Question

Can de-pseudo also ship as a Chrome/Edge browser extension, how hard is it, and how much of the existing app can be reused?

## Short answer

**Very feasible, and most of the app carries over unchanged.** de-pseudo is already a 100% client-side, backend-free React/Vite SPA with no remote data flow — that's exactly the shape Manifest V3 wants. A minimum-viable extension (same UI, opened from the toolbar instead of a URL) is a small, low-risk project: new manifest, a couple of build-config changes, self-hosted fonts, and store listings. A deeper integration (detecting ChatGPT/Claude.ai/Copilot tabs and wiring pseudonymize/resolve directly into their input boxes) is a materially bigger, separate project with real security tradeoffs, and should be scoped later, only if wanted.

Chrome and Edge both run Manifest V3 on the same Chromium extension platform, so **one codebase, one build, two store listings** — there is no meaningful "Edge version" beyond re-submitting the same package.

## What carries over as-is

Everything under `src/domain`, `src/lib/core`, `src/crypto`, `src/storage`, `src/i18n`, and the MUI component tree is plain browser-standard code with no dependency on being served from `https://jsilvanus.github.io`:

- **Pseudonymization, prompt building, result resolution, schema/reference logic** (`src/domain/*`, `src/lib/core/*`) — pure TypeScript, no DOM/browser API dependency beyond `crypto.getRandomValues`. Reuse: 100%.
- **Cryptoshred / vault** (`src/crypto/vault.ts`, `src/domain/shred/*`) — Web Crypto (`crypto.subtle`) is fully available in extension pages (popup, side panel, options page all run as normal web pages under the extension's origin). Reuse: 100%.
- **IndexedDB persistence** (`src/storage/localVault.ts`) — IndexedDB is available and *sandboxed per-extension* in Manifest V3 extension pages, same API, no code change needed. Reuse: 100%.
- **React UI, MUI components, i18n, ReferenceEditor, HowItWorks, etc.** — reuse: 100%, unchanged.
- **File import** (`loadFile`, drag/drop, `<input type=file>`, xlsx parsing) — works identically in an extension page.
- **Test suite** (vitest unit/integration tests, the fuzz test) — all of it keeps validating the reused domain code untouched; no adaptation needed.

In short: the entire `src/` tree except two integration points (below) is extension-agnostic already, because the app was built with no server and no assumptions about its own origin.

## What needs to change

### 1. Build output → extension bundle
Vite already supports building a static asset bundle (`base: './'`, relative paths — this was done for GitHub Pages and happens to also be exactly what MV3 needs). Add:
- A `manifest.json` (Manifest V3): `action` (toolbar popup) or `side_panel`, `permissions: ["storage"]` (only if using `chrome.storage` — otherwise none needed, since IndexedDB doesn't require a permission), `content_security_policy` for extension pages.
- A second Vite entry (or a small separate `vite.config.extension.ts`) that emits into `dist-extension/` alongside the existing web build, since the extension doesn't need `index.html` served at a domain root the same way.
- Icons at the required sizes (16/32/48/128).

### 2. Google Fonts `<link>` tag → self-hosted fonts
`index.html` pulls Fraunces/Nunito Sans from `fonts.googleapis.com`/`fonts.gstatic.com`. Manifest V3's default `content_security_policy` for extension pages **disallows remote stylesheets/fonts** (`style-src 'self'`, no remote origins) — this is the one real code change forced by the platform, not a workaround. Fix: download the two font families, self-host as static assets (a few hundred KB), and swap the `<link>` for a local `@font-face`. Straightforward, ~1 hour of work.

### 3. Clipboard access
`navigator.clipboard.readText()`/`writeText()` (used in `App.tsx` for "load from clipboard" and the copy buttons) works in extension pages exactly as in a normal tab — extension pages are a secure context and clipboard calls still require a user gesture, which the existing buttons already provide. No change needed for the popup/side-panel UI itself. (Clipboard access from a *content script* injected into a third-party page is a separate, stricter story — see the "content-script" option below.)

### 4. `__APP_VERSION__` / any absolute paths
Already relative (`base: './'`), already injects version via Vite `define`. No change needed.

## Distribution shape — two real options

**A. Standalone extension UI (recommended MVP).** The existing app, verbatim, opened from a toolbar icon as a **popup** or (better, given how tall this UI is) a Chrome/Edge **side panel** (`sidePanel` API, MV3). The user still copies pseudonymized text out and pastes it into ChatGPT/Claude/Copilot/etc. by hand, same workflow as today, just without needing a browser tab pinned to the GitHub Pages URL. This requires **no new permissions** beyond what a normal page already gets (clipboard via user gesture, IndexedDB, Web Crypto) — which matters a lot for Chrome Web Store / Edge Add-ons review, since a permission-light extension is fast to approve and easy for users to trust for a privacy tool.

Side panel is worth calling out specifically: it stays open alongside the AI chat tab instead of covering it like a popup does, which fits this app's actual workflow (switch back and forth between de-pseudo and the AI chat) much better than a popup that closes on every focus change.

**B. Page-integrated content script (future, separate scope).** A content script injected into `chat.openai.com`, `claude.ai`, `copilot.microsoft.com`, etc. that adds an in-page "pseudonymize & insert" / "resolve reply" affordance directly in those sites' text boxes. This is a genuinely different, larger project:
- Needs `host_permissions` for each target site (a much heavier ask in store review, and a real trust decision for users — "this extension can read and modify chat.openai.com").
- Needs per-site DOM integration that breaks whenever those sites change their markup (ongoing maintenance burden, not a one-time cost).
- Raises the actual security bar: the identity mapping and pseudonymization logic would need message-passing between an isolated content-script context and the extension's storage, and care to avoid ever letting the host page's JS observe unpseudonymized data.
- Delivers real UX value (no manual copy/paste) but is not needed to answer "can this be an extension" — it's a v2 idea, not part of feasibility.

**Recommendation: ship A first.** It's low-risk, high-reuse, and delivers the actual ask ("have this app as an extension too"). Revisit B only if manual copy/paste turns out to be a real friction point in practice.

## Effort estimate (option A)

| Step | Work | Size |
|---|---|---|
| Manifest V3 setup | `manifest.json`, icons, side-panel vs popup entry HTML | Small |
| Vite extension build | second build target emitting `dist-extension/` | Small |
| Self-host fonts | download + local `@font-face`, drop remote `<link>` | Small |
| CSP verification | confirm no remote script/style/connect under MV3's default `content_security_policy`; audit MUI/Emotion (runtime `<style>` injection, not `eval`/`new Function` — compatible with MV3's default CSP with no `unsafe-eval` needed) and the `xlsx` parser for any dynamic-code paths | Small |
| Manual QA | side panel open/close, IndexedDB persistence across panel close/reopen, clipboard copy/paste, file import, shred | Small–Medium |
| Store listings | Chrome Web Store + Edge Add-ons: descriptions, screenshots, privacy justification (no data collection, matches the existing privacy-policy story) | Small–Medium (mostly non-engineering) |
| CI | extra GitHub Actions job to build+zip the extension bundle as a release artifact | Small |

Overall: **a few days of focused work**, not a rewrite — the domain/crypto/UI code is already extension-compatible; the work is packaging, CSP compliance for fonts, and store submission logistics. Chrome and Edge submissions are near-identical (same Chromium engine, same Manifest V3, same `.zip`/`.crx`), so there's no meaningful "per-browser" multiplier.

## Risks / things to watch

- **Chrome Web Store review time** for a new listing can take days, independent of code quality — factor that into any launch timeline.
- **MV3 CSP is stricter than a normal webpage's**, but nothing in this codebase currently needs `unsafe-eval` or remote script loading (no CDN JS, no `eval`), so this should be a non-issue beyond the fonts fix — worth a final grep-based audit of dependencies (especially `xlsx`, which does complex binary parsing) before submission, to be certain no dependency dynamically loads code.
- **Side panel vs popup is a real UX decision**, not just a manifest flag — worth a quick prototype/click-through before committing.
- **Keep the "local-first, no backend" story identical to the web app** in the store listing's privacy section — the extension changes *how the app is opened*, not the privacy architecture. Same shred semantics, same "no remote data store" claim, still true.
- Don't bundle option B (content-script chat integration) into the same release — it changes the permission and trust profile enough that it should be its own decision, reviewed separately.

## Implementation (option A, shipped)

**Status: implemented.** `npm run build:extension` produces a Manifest V3 side-panel extension in `dist-extension/`, loadable unpacked in Chrome or Edge today. Concrete decisions:

- **Build.** `vite.config.extension.ts` is a separate Vite config (own `root: extension/`, own `outDir: dist-extension/`) rather than a mode flag on the main config — the two builds share only the plugin list and `src/` entry point, everything else (root, entry HTML, output post-processing) differs. It reuses `src/main.tsx` verbatim as the React entry, so the entire app — domain logic, crypto/vault, IndexedDB storage, MUI UI, i18n — is 100% the same code as the web build; only `extension/sidepanel.html` (a trimmed `index.html`) and `extension/manifest.json`/`background.js`/icons are extension-specific.
- **Manifest.** `extension/manifest.json` is a template with `"version": "__APP_VERSION__"`, substituted from `package.json` by a small Vite plugin (`closeBundle` hook) so the extension version can never drift from the app version. Permissions are just `["sidePanel"]` — no `host_permissions`, no `storage` permission (state lives in IndexedDB, which needs no manifest declaration).
- **Side panel behavior.** `extension/public/background.js` is a minimal MV3 service worker (no build step — plain JS, copied verbatim via `publicDir`) whose only job is `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, so the toolbar icon opens the panel directly.
- **Fonts.** Both Fraunces and Nunito Sans turned out to be *variable* fonts — Google Fonts was already serving one file per family covering every weight the app uses. They're downloaded once (`src/assets/fonts/*.woff2`, latin subset only — covers English and Finnish) and declared via local `@font-face` rules in `src/fonts.css`, imported from `main.tsx`. This replaces the `<link>` tags in `index.html` for **both** the web app and the extension — one font-loading strategy, and the web app now makes zero requests to Google's CDN, which directly matches the "verify no unintended network requests" hardening goal already in `PLAN.md`. (Correction to the original feasibility note above: MV3's *default* CSP only restricts `script-src`/`object-src`, not `style-src`, so a remote stylesheet would actually still have loaded — self-hosting was the right call regardless, for the privacy/no-network-calls story, not because the platform forced it.)
- **Icons.** No brand icon existed before this (the web app just uses the 🎭 emoji next to the title); `extension/public/icons/icon{16,32,48,128}.png` are a generated placeholder monogram ("dp" on a rounded terracotta square, matching `theme.ts`'s palette) swappable later without touching any other file.
- **Testing.** `tests/e2e-extension/` adds a Playwright suite (`playwright.config.extension.ts`, run via `npm run test:e2e:extension`) using the documented Playwright pattern for extension testing: `chromium.launchPersistentContext` with `--load-extension`, waiting on the `serviceworker` event for the extension ID, then driving `chrome-extension://<id>/sidepanel.html` directly. It runs one real pseudonymize round trip to confirm the reused domain code and IndexedDB/Web Crypto work unchanged from the extension's own origin — not just that the page renders. All 125 existing unit tests and all 24 existing web e2e tests were re-run after the font/index.html change and still pass unmodified.
- **CI.** `test.yml` gained two jobs: `build-extension` (builds, validates `manifest.json` parses, zips `dist-extension/` as a downloadable artifact on every run) and `playwright-extension` (runs the new suite). Neither publishes to a store — there's no store credential/listing yet, so the zip is a manual-install artifact for now.

Not done, deliberately out of scope for this pass: actual Chrome Web Store / Edge Add-ons store listings (accounts, screenshots, privacy-practice forms — non-engineering work for a human to do), and option B (content-script chat-page integration), per the recommendation above.

## Suggested next step

Try `dist-extension/` loaded unpacked in Chrome and Edge, confirm the side-panel UX feels right in practice, then decide whether to invest in store listings.
