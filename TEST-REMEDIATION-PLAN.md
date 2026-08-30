# Test Remediation Plan

The current CI failures are split into three independent phases. Each phase should leave the previous phase green before moving on.

## Phase 1 — Test/build infrastructure

Goal: make CI execute the real test suites reliably.

- Restore the missing root `tsconfig.json` required by the production build.
- Keep Playwright specs out of Vitest discovery.
- Verify `npm ci` succeeds from the committed lockfile.
- Run TypeScript/build and unit/integration jobs independently.
- Do not weaken security tests to make CI green.

Status: **Implemented; awaiting CI verification**.

Implemented:
- Added a strict Vite-compatible `tsconfig.json` for `src`.
- Updated Vitest exclusions so Playwright specs are not treated as Vitest tests.
- Confirmed the repository contains a committed `package-lock.json`.

## Phase 2 — Broken/stale test contracts and crypto lifecycle

Goal: align tests and implementations without hiding real failures.

- Replace stale imports such as the old pseudonym/result module paths.
- Align response-format tests with the current session/result contract.
- Align cryptoshred tests with the current vault API.
- Isolate IndexedDB state between tests so database-version state cannot leak between cases.
- Add/repair integration coverage for encrypt → restore → shred → failed restore/resolve.
- Verify the public library API remains clean and extractable.

Status: **Implemented; awaiting CI verification**.

Implemented:
- Migrated obsolete workflow and adversarial resolver tests to the current core API.
- Repaired cryptoshred integration tests to use the current `loadSession`/`saveSession` vault boundary.
- Removed the obsolete `localKey`/`loadEncryptedVault` test contract.
- Added explicit SessionVault lifecycle and session-id tests.
- Tests clear the active IndexedDB session before each vault lifecycle case.

## Phase 3 — Prompt privacy boundary / leakage hardening

Goal: guarantee that personal identity data cannot enter an AI prompt accidentally.

- Fix prompt construction so selected output/data columns are explicit and identity columns are never serialized merely because they exist in the source row.
- Preserve the user's configurable column/reference model.
- Ensure pseudonymized values are the only identity representation exposed to the AI round.
- Add regression tests for direct identifiers, indirect references, free text, column insertion, and prompt-token expansion.
- Test that final AI output can be resolved locally without sending the mapping or original identity to the AI.
- Add adversarial leakage tests using names, aliases, reference labels, and prompt-injection-like instructions.

Status: **Implemented; awaiting CI verification**.

Implemented:
- Prompt construction now treats the dataset schema as the authoritative privacy boundary.
- `pseudonymize` and `remove` columns are excluded from AI payloads even when prompt tokens request them.
- Common direct-identifier columns are conservatively blocked when no schema is supplied.
- Added schema-driven regression coverage for identity, kept data, and pseudonymized references.
- Existing prompt leakage tests remain active and were not weakened.

## Exit criteria

A phase is complete only when its relevant CI job is green and its tests demonstrate the intended behavior. A later phase must not be used to suppress failures from an earlier phase.
