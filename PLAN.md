# de-pseudo — Architecture & Implementation Plan

## Purpose

`de-pseudo` is a local-first tool for pseudonymizing personal data before it is pasted into an AI prompt, then locally resolving the AI's pseudonymized result back to the original people.

The central privacy boundary is:

> Personal data enters the local application. Only pseudonymized data leaves the local application. The local identity mapping can be cryptographically shredded so that the pseudonyms can no longer be linked to people.

The application must not require a backend, account, analytics, or remote data store.

## Core workflow

1. User enters or imports a table containing a username/name and related data.
2. The application generates a cryptographically random pseudonym for every record.
3. The original data and pseudonym mapping remain local.
4. The application produces copyable pseudonymized prompt data.
5. User adds an instruction, e.g. `Make an order based on food preferences.`
6. User pastes the resulting AI response back into de-pseudo.
7. de-pseudo identifies pseudonyms and resolves them locally to the original names.
8. User can inspect the final resolved result.
9. **Shred** permanently destroys the local identity mapping, cryptographic key material, source personal data, prompt history, and result data held by the application.

Example:

```text
Input:
Juha | wants icecream
Anna | wants pizza

Pseudonymized:
xncngdl3 | wants icecream
fnfifk32 | wants pizza

AI result:
xncngdl3 -> vanilla icecream
fnfifk32 -> pizza

Resolved locally:
Juha -> vanilla icecream
Anna -> pizza
```

## Technology decision

Use:

- React
- TypeScript
- Vite
- Material UI
- Web Crypto API
- IndexedDB for optional persistent local state
- PWA/offline support later

Do **not** introduce Next.js or a server for the MVP. The absence of a backend is part of the privacy architecture.

## Security model

### Pseudonyms

Pseudonyms should be generated from cryptographically secure random bytes rather than from usernames. The pseudonym itself is not the secret; the local mapping is the sensitive asset.

Use a human-copy-friendly encoding and avoid ambiguous characters where practical.

### Local mapping

Conceptually:

```text
pseudonym -> original identity
```

The mapping must remain local and should be protected at rest when persistence is enabled.

### Cryptoshred

Use Web Crypto for local encryption. A randomly generated master/session key protects the sensitive local state. Shredding destroys the key and deletes the associated local encrypted state.

The system must treat shredding as irreversible: after shredding, de-pseudo must not have the information or key material necessary to reconstruct the identity mapping.

Cryptographic deletion should be complemented by ordinary deletion of IndexedDB records and in-memory state. The documentation must avoid claiming that browser storage deletion is a forensic guarantee.

### Privacy boundary

The prompt/result layer must not need access to original identities. Keep domain types and services separated so that identity resolution is an explicit local operation.

Pseudonymization is not automatically anonymization. Even after names are removed, combinations of attributes can identify a person. The UI and documentation should make this distinction clear.

## Domain architecture

```text
UI
 |
 v
Application services
 |
 +-- Dataset
 +-- Pseudonymizer
 +-- Prompt transformer
 +-- Result resolver
 +-- Cryptoshredder
 |
 +-- Web Crypto
 +-- IndexedDB
```

Suggested domain areas:

- `dataset` — records, fields, import/export representation
- `pseudonym` — random identifier generation and mapping
- `prompt` — pseudonymized prompt construction
- `result` — result parsing and local resolution
- `shred` — lifecycle and destruction semantics
- `crypto` — key generation, encryption/decryption, key destruction
- `storage` — IndexedDB persistence

## Initial project structure

```text
de-pseudo/
├── src/
│   ├── app/
│   ├── domain/
│   │   ├── dataset/
│   │   ├── pseudonym/
│   │   ├── prompt/
│   │   ├── result/
│   │   └── shred/
│   ├── crypto/
│   ├── storage/
│   ├── components/
│   └── types/
├── tests/
│   ├── pseudonym/
│   ├── crypto/
│   ├── shred/
│   ├── dataset/
│   └── integration/
├── public/
└── README.md
```

## UI roadmap

### Dataset

- Paste/import tabular data
- Editable table
- Identify the identity/name column
- Show data locally
- `Pseudonymize` action

### Prompt

- Display pseudonymized data
- Prompt editor
- Copy complete prompt/data to clipboard
- Make it obvious that only pseudonymized data should be sent to an external AI

### Result

- Paste AI response
- Detect known pseudonyms
- Resolve them locally
- Show original names with final choices

### Shred

Dedicated destructive action with clear confirmation:

> This permanently destroys the local identity mapping and personal data stored by de-pseudo. There is no recovery after shredding.

## Field handling roadmap

MVP can treat the first column as the identity field, but the architecture should support explicit field classification later:

- identity / direct identifier -> pseudonymize
- contact information -> pseudonymize
- quasi-identifying information -> configurable
- task/attribute data -> retain where appropriate
- free text -> warn/review

The product must not imply that deleting a name makes arbitrary personal data anonymous.

## Testing strategy

Privacy/security functionality gets extensive automated testing.

### Pseudonym tests

- correct format
- uniqueness for normal datasets
- cryptographic randomness source is used
- collision handling
- malformed identifiers
- new session creates fresh pseudonyms

### Mapping tests

- pseudonym -> identity
- identity -> pseudonym where supported
- unknown pseudonym
- duplicate identity names
- missing values

### Crypto tests

- key generation
- encrypt/decrypt round trip
- wrong key fails
- modified ciphertext fails authentication
- missing key fails safely
- key lifecycle

### Shred tests

- create dataset
- create mapping
- encrypt/persist state
- verify state can be recovered before shred
- shred
- verify key is unavailable
- verify mapping is unavailable
- verify personal data is removed from active state
- verify subsequent resolution fails

### Integration tests

```text
input
 -> pseudonymize
 -> build prompt
 -> simulated AI response
 -> resolve locally
 -> shred
 -> verify destruction
```

Also test malformed and adversarial AI output, including unknown pseudonyms and text attempting to imitate pseudonyms.

## Implementation phases

### Phase 1 — Core

1. Bootstrap Vite + React + TypeScript.
2. Establish domain types.
3. Implement local table input.
4. Implement secure random pseudonym generation.
5. Implement mapping.
6. Generate pseudonymized text.
7. Copy to clipboard.

### Phase 2 — AI round trip

8. Prompt editor.
9. Paste AI response.
10. Parse pseudonyms.
11. Resolve pseudonyms locally.
12. Display resolved result.

### Phase 3 — Cryptoshred

13. Implement Web Crypto key lifecycle.
14. Encrypt sensitive local state.
15. Implement shred service.
16. Delete local persistent state.
17. Clear in-memory state.
18. Add security-state indicators and tests.

### Phase 4 — Persistence

19. IndexedDB storage.
20. Restore local session.
21. Refresh/reload behavior.
22. Session expiration policy.
23. Manual shred.

### Phase 5 — Hardening

24. Extensive unit tests.
25. Integration tests.
26. Property/fuzz tests for result parsing.
27. Strict Content Security Policy.
28. Verify no unintended network requests.
29. Dependency/security audit.
30. Privacy/security documentation.

### Phase 6 — UX

31. CSV import.
32. Better table editor.
33. Field classification.
34. Improved copy/paste workflow.
35. PWA/offline support.
36. Clear local-only status.

## Architectural principles

1. **Local first.** Personal data never needs a server.
2. **The mapping is the secret.** Pseudonyms are random identifiers; the identity mapping is protected.
3. **AI sees pseudonyms, not identities.**
4. **Resolution is local.** The external AI never receives the identity mapping.
5. **Shredding is a first-class operation.** It is part of the domain model, not merely a UI delete button.
6. **Pseudonymization is not anonymization.** Attribute combinations may remain identifying.
7. **Security behavior is tested.** Especially the complete pseudonymize -> resolve -> shred lifecycle.
8. **No MCP/backend in the initial implementation.** Keep the core clean and programmatic so an integration can be considered later without compromising the local privacy boundary.
