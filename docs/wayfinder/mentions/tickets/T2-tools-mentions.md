---
id: T2
title: MCP tools — send mentions, poll mentions_me
label: wayfinder:task
status: open
assignee:
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
