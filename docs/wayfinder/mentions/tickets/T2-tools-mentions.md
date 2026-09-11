---
id: T2
title: MCP tools — send mentions, poll mentions_me
label: wayfinder:task
status: closed
assignee: claude-orchestrator
blocked-by: [T1]
---

## Question

(Execution slice.) Expose ADR 0012 through the 8 tools, TDD in `tools.test.ts`:

- `send_message` gains `mentions?: string[]` (zod: array of 1..MAX_NAME_LENGTH strings).
  Validate **every** entry against the Room's current roster — any unknown name fails
  the whole send loudly ("X is not a member of this room"), nothing stored. Validation
  runs after the `accessibleRoom` gate (private-room invisibility unchanged, ADR 0009).
- `get_messages` gains `mentions_me?: boolean` — filters via the store's `mentioning`
  param using the request-bound member; composes with `since`.
- Message payloads (`get_messages` structured content, Room resource JSON) include
  `mentions` where present.
- Instructions block: the attention contract — a mention requests your attention; on
  catch-up check `mentions_me: true` first, then read surrounding context before
  acting; no obligation to reply.
- Tests: happy path, unknown-name loud failure, watcher/non-member unmentionable,
  `mentions_me` returns only my mentions after the cursor, legacy messages unaffected.

## Resolution (2026-08-31)

Implemented as specified (codex coded; orchestrator wrote the 5 failing tests first —
red confirmed — reviewed the diff, ran the gates).

- `send_message` takes `mentions?: string[]` (zod, 1..MAX_NAME_LENGTH each); roster
  validation runs after the `accessibleRoom` gate and fails the whole send with
  `"<name> is not a member of this room"` (first offender), nothing stored.
- `get_messages` takes `mentions_me?: boolean` → `store.getMessages(room, since,
  member)` with the request-bound member; composes with `since`.
- Payloads pass `StoredMessage` through whole, so `mentions` reaches structured
  content and the Room resource JSON; legacy messages read back with no field.
- Instructions block carries the attention contract (check `mentions_me: true` first
  on catch-up, read context, no obligation to respond).
- Watchers stay unmentionable until they join (test covers watch → fail → join → ok).
- Gates: 92 tests green (+5), typecheck + lint clean.
