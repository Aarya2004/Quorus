---
id: T1
title: Store layer — mentions persist and filter
label: wayfinder:task
status: closed
assignee: claude-orchestrator
blocked-by: []
---

## Question

(Execution slice.) Make both stores carry and query mention metadata, contract-first:

- `StoredMessage` gains `mentions?: string[]` (absent/empty for pre-0012 data).
- `Store.appendMessage(roomId, from, text, mentions?)`.
- `Store.getMessages(roomId, since?, mentioning?)` — `mentioning` filters to messages
  whose mentions include that member; combines with the seq cursor.
- Shared contract suite (`store-contract.ts`) tests: mentions round-trip on both
  backends; filter respects `since`; unmentioned/legacy messages read back clean;
  persistence across reopen.
- SQLite: `message_mentions(room_id, seq, member)` join table (indexed), created
  if-not-exists — pre-0012 databases (dogfood volume) must open unchanged.
- JSONL: array inline on the message line; absent field normalizes.

Done when the contract suite passes ×2 backends and typecheck/lint are green.

## Resolution (2026-08-31)

Implemented as specified (codex subagent coded, orchestrator wrote the failing contract
tests first — red confirmed at 6 failures ×2 backends — then reviewed and gated).

- `StoredMessage.mentions?: string[]` — absent (not `[]`) when none; empty input
  normalizes to absent on both write and read; duplicates deduped via `Set` at append.
- `Store.appendMessage(..., mentions?)` / `Store.getMessages(roomId, since?, mentioning?)`;
  the `mentioning` filter composes with the seq cursor (cursor applies first).
- SQLite: `message_mentions(room_id, seq, member)` PK + `idx_message_mentions_member
  (room_id, member, seq)` index, both `IF NOT EXISTS`; the `messages` table is untouched,
  so pre-0012 databases (dogfood volume) open unchanged. Filtered reads go through the
  join table; both `getMessages` and `getMessagesBefore` hydrate mentions.
- JSONL: array inline on the line only when non-empty; absent field normalizes on read.
- Gates: 87 tests green (was 79; +4 contract tests ×2 backends), typecheck + lint clean.
