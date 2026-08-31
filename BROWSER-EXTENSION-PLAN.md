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

## Suggested next step

If this plan looks right, the concrete first PR would be: add `manifest.json` + a `sidepanel.html` entry pointing at the existing `App.tsx`, a second Vite build config, self-hosted fonts, and a CI job that zips the result — all additive, no changes to existing domain/web-app code or the GitHub Pages deploy.
