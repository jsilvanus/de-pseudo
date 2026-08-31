# Android ideas (exploratory — nothing here is implemented)

Two ideas came up for getting de-pseudo's pseudonymize/resolve workflow onto Android, alongside the Chrome/Edge extension. Neither is a browser extension — Chrome for Android doesn't support extensions at all, so both would be a separate native Android app. Recorded here so they aren't lost; nothing below has been scoped into an implementation plan yet.

## Idea 1 — floating "chat head" overlay bubble

A Messenger-style bubble that floats over other apps (including AI chat apps) and opens de-pseudo without switching apps.

- Requires the `SYSTEM_ALERT_WINDOW` ("draw over other apps") permission — a special permission Android makes the user grant explicitly in Settings, flagged prominently as sensitive.
- To actually read or fill text inside *another* app (e.g. autofilling a prompt into the ChatGPT app's input, or reading its latest reply) needs Android's **Accessibility Service API** — the same API class screen readers use. It can inspect and interact with any app's on-screen UI tree, which is exactly why Google Play scrutinizes its use heavily; approval requires a strong justification tied to accessibility, and utility/productivity apps using it for convenience features (translation overlays, password-manager autofill) do get through review, but it's a narrower, slower path than a Chrome extension listing.
- A **lighter version avoids Accessibility Service entirely**: the bubble just launches de-pseudo (or a lightweight version of it) and hands off text via the clipboard or Android's Share sheet — no auto-fill/auto-capture, but Play-Store-friendly and much less code. This is the realistic starting point if this idea is ever picked up; the full auto-fill version is a materially bigger, separate step after it.

## Idea 2 — text-selection context menu action (`PROCESS_TEXT`)

Android lets an app register itself in the text-selection floating toolbar that appears whenever text is selected in *any* app — the same slot "Translate" or a dictionary lookup uses (`ACTION_PROCESS_TEXT` intent, declared via an intent filter on an activity).

- Select text anywhere — inside the ChatGPT app, a browser, Gmail, anywhere — and "de-pseudo: Resolve" (or "Pseudonymize") would appear as an option in that toolbar.
- The selected text is delivered to the app via `EXTRA_PROCESS_TEXT`. de-pseudo would check it for the SESSION ID marker / pseudonym-shaped tokens against the local vault and resolve it.
- If the selection was **editable** (`EXTRA_PROCESS_TEXT_READONLY=false`) the app can return replacement text, which Android substitutes for the selection **in place** — select the AI's pseudonymized reply, tap "Resolve with de-pseudo", and the resolved names appear right there in the chat app's own text, no copy-paste round trip at all.
- No special/sensitive permissions needed at all — no overlay permission, no Accessibility Service. This is a standard, low-scrutiny Android mechanism (same one Google Translate uses), so it'd clear Play Store review far more easily than the overlay approach.
- Symmetric use for the *other* direction is more awkward: pseudonymizing raw personal data before pasting into a prompt would need the selection to be in an app where you're composing, not reading — still doable (select the personal data anywhere it's editable, tap "Pseudonymize with de-pseudo", get pseudonymized text back in place), just a less natural fit than the resolve direction.

**This is the better starting point of the two** if an Android companion is ever built: no sensitive permissions, works uniformly across every app without per-app integration work, and the in-place-replace round trip is arguably a nicer UX than even the desktop extension's chat-tab bridge.

## Common thread

Both ideas require a native Android app — none of the current React/Vite/browser-extension code is reusable as-is (no APK-generating step exists), though the app's core domain logic (pseudonymize, resolve, session/vault format) is plain TypeScript and could inform a native reimplementation or, if a WebView-hosted approach were used instead, potentially be reused via a thin native wrapper. That reuse question hasn't been explored and would need its own investigation before committing to either idea.
