---
id: T1
title: Store layer — mentions persist and filter
label: wayfinder:task
status: open
assignee:
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
