# de-pseudo

**Live app: [jsilvanus.github.io/de-pseudo](https://jsilvanus.github.io/de-pseudo/)**

A local-first tool for pseudonymizing personal data before pasting it into an AI prompt, then locally resolving the AI's response back to the original people.

The central privacy boundary:

> Personal data enters the local application. Only pseudonymized data leaves the local application. The local identity mapping can be cryptographically shredded so the pseudonyms can no longer be linked to people.

de-pseudo runs entirely in your browser. There is no backend, no account, no analytics, and no remote data store — your data never leaves your device unless you copy it out yourself.

## How it works

1. Paste or import a table containing names and related data.
2. de-pseudo generates a cryptographically random pseudonym for every person.
3. The original data and the pseudonym mapping stay on your device.
4. Copy the pseudonymized data into your prompt to an AI assistant.
5. Paste the AI's response back into de-pseudo.
6. de-pseudo resolves the pseudonyms locally, back to the original names.
7. **Shred** permanently destroys the local identity mapping, key material, and stored personal data whenever you're done.

```text
Input:                  Pseudonymized:            AI result:              Resolved locally:
Juha | wants icecream   xncngdl3 | wants icecream xncngdl3 -> vanilla     Juha -> vanilla icecream
Anna | wants pizza      fnfifk32 | wants pizza    fnfifk32 -> pizza       Anna -> pizza
```

Pseudonymization is not anonymization — attribute combinations can still identify someone. de-pseudo helps you avoid handing names to a third-party AI, but the resulting data may still be identifying, so review it before sharing further.

## Browser extension

de-pseudo is also available as a Chrome/Edge side panel extension — the same app, opened from the toolbar instead of a tab, so it can sit open alongside an AI chat tab. It reuses the web app's code unchanged, and adds two optional buttons that fill a recognized AI chat tab's message box with the generated prompt and pull its latest reply back in (ChatGPT, Claude, Copilot, Gemini) — never auto-submitting, so you still review what's sent. See [BROWSER-EXTENSION-PLAN.md](./BROWSER-EXTENSION-PLAN.md) for the design and known limitations.

```bash
npm run build:extension   # builds dist-extension/
```

To load it locally: open `chrome://extensions` (or `edge://extensions`), enable Developer mode, choose "Load unpacked", and select `dist-extension/`. Click the toolbar icon to open the side panel.

## Development

```bash
npm install
npm run dev                # start the dev server
npm run build               # type-check and build the web app for production
npm run build:extension     # type-check and build the browser extension
npm run test                # unit tests (vitest)
npm run test:e2e            # web app end-to-end tests (playwright)
npm run test:e2e:extension  # extension end-to-end test (playwright, needs build:extension first)
```

See [PLAN.md](./PLAN.md) for the architecture and design rationale.

## License

[EUPL-1.2](./LICENSE)
