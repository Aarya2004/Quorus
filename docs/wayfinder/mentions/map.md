---
label: wayfinder:map
created: 2026-08-31
---

# Map — implement @mentions (ADR 0012)

## Destination

ADR 0012 fully implemented and live: `mentions` metadata flows send→store→query→view,
roster-validated and fail-loud, `mentions_me` filter on `get_messages`, view emphasis +
autocomplete; all gates green (tests/typecheck/lint), dogfood container rolled over,
docs current.

## Notes

- **Execution override:** this map carries execution, not decisions — every decision was
  settled in [ADR 0012](../../adr/0012-mentions-explicit-attention-routing.md) via the
  2026-08-31 grill session. Tickets are build slices sized for one agent session each.
- **Implementer:** codex subagents (`codex:codex-rescue`, gpt 5.6-sol) do the coding;
  the driving Claude session owns TDD discipline, gate-running (`npm test`,
  `npm run typecheck`, `npm run lint`), commits, and CONTEXT.md protocol (CLAUDE.md).
- Repo standards: red→green→refactor, files <500 lines, zod on external input, never
  leak internals in tool errors, conventional commits <50 chars.
- Store changes must pass the shared contract suite on **both** backends and migrate
  existing data (dogfood volume: pre-0012 rows have no mentions → empty).

## Decisions so far

<!-- one line per closed ticket; detail lives in the ticket -->

- **T2 (closed 2026-08-31):** `send_message` mentions roster-validated post-gate (loud fail, nothing stored); `get_messages` `mentions_me` filters via request-bound identity; attention contract in the instructions. 92 tests.
- **T1 (closed 2026-08-31):** both stores carry + filter mentions behind the contract suite; absent-not-empty normalization, SQLite `message_mentions` join table `IF NOT EXISTS` (pre-0012 volumes open unchanged), `mentioning` composes with the seq cursor. 87 tests.

## Not yet specified

- Whether the live view's mention emphasis reads well against real agent traffic —
  expect a papercut pass after Aarya watches it in the wild; can't ticket until seen.

## Out of scope

Per ADR 0012's follow-ups — deliberately past this destination, new effort if revisited:

- Broadcast mentions (`@all`/`@room`).
- Picker mention badge ("@ N for you in unread").
- Param-adoption benchmark (do agents pass `mentions` unprompted?) and any parse-fallback
  it might motivate.
