# Test Remediation Plan

The current CI failures are split into three independent phases. Each phase should leave the previous phase green before moving on.

**2026-08-30 update:** the three phases below were previously marked "implemented" without ever actually running `npm ci`, `npm test`, `npm run build`, or the Playwright suite — the project had never been built. All four have now actually been run and are green (`npm test`: 59/59, `npm run build`: clean, `npx tsc -b`: clean, `npx playwright test`: 4/4). Doing so surfaced several real bugs the phases below missed; see "Phase 4" at the bottom.

## Phase 1 — Test/build infrastructure

Goal: make CI execute the real test suites reliably.

- Restore the missing root `tsconfig.json` required by the production build.
- Keep Playwright specs out of Vitest discovery.
- Verify `npm ci` succeeds from the committed lockfile.
- Run TypeScript/build and unit/integration jobs independently.
- Do not weaken security tests to make CI green.

Status: **Implemented and verified.**

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

Status: **Implemented and verified.**

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

Status: **Implemented and verified.**

Implemented:
- Prompt construction now treats the dataset schema as the authoritative privacy boundary.
- `pseudonymize` and `remove` columns are excluded from AI payloads even when prompt tokens request them.
- Common direct-identifier columns are conservatively blocked when no schema is supplied.
- Added schema-driven regression coverage for identity, kept data, and pseudonymized references.
- Existing prompt leakage tests remain active and were not weakened.

## Phase 4 — Bugs found by actually running the suite

Goal: fix the real defects that surfaced once the app was built, tested, and driven end-to-end in a browser for the first time, rather than trusting that green-looking phase notes meant the app worked.

- `tsc -b` failed outright: `App.tsx` imported a `resolveResult` module that didn't exist, `ReferenceEditor.tsx` and `crypto/vault.ts` had type errors. Nothing had ever compiled.
- `src/domain/*` (an earlier pseudonymize/prompt/result implementation) and `src/lib/core/*` (the implementation the UI actually uses) had diverged: mismatched mapping types (`PseudonymMapping[]` vs `IdentityMapping`), a stale `resolveResult` return-type contract between `workflow.test.ts` and `resolve.ts`, and a duplicate `e2e.test.ts` importing a module that was never created. Reconciled by keeping `resolve.ts`'s array-based, adversarially-tested contract and fixing its one caller (`App.tsx`) and its test (`workflow.test.ts`) to match; deleted the unreconcilable duplicate.
- The pseudonym-boundary regex in `resolve.ts` used `\b`, which treats `-` as a boundary character — `prefix-<pseudonym>-suffix` was incorrectly resolved as a bare pseudonym. Replaced with an explicit alphanumeric/hyphen lookaround.
- `lib/core/prompt.ts`'s schema-based column blocking removed a blocked column's *value* but still rendered its `name:` label via `{{column}}` tokens, and the pseudonymized dataset was only visible to the AI when the task text explicitly included `{{pseudonymized values}}`. Fixed both so the schema is a true privacy boundary and the dataset is always visible by default.
- **The default schema's `output` list only mapped the resolved identity, with no field for the AI's actual answer** — so the "Final output" step always showed just the resolved names with no content, silently discarding the whole point of the round trip (see PLAN.md's own example: `Juha -> vanilla icecream`). Fixed `defaultSchema` to include a `result`/`choice` field by default.
- The Playwright suite referenced a "Paste data" field the UI never had, and asserted a 32-hex-char pseudonym format the generator never produced (it's 12 chars, by design, for human-copy-friendliness). Added the missing paste-text input to `App.tsx` and corrected the spec's assumptions; all 4 e2e tests now pass against a real Chromium session driving the full pseudonymize → prompt → AI response → resolve → shred lifecycle.
- The repository had no `.gitignore`, so `node_modules/`, `dist/`, and TypeScript build info were one `git add .` away from being committed.

Status: **Implemented and verified** — `npm test`, `npx tsc -b`, `npm run build`, and `npx playwright test` all pass from a clean `npm ci`.

## Exit criteria

A phase is complete only when its relevant CI job is green and its tests demonstrate the intended behavior. A later phase must not be used to suppress failures from an earlier phase.
