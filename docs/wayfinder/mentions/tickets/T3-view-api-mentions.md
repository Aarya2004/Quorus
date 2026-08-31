---
id: T3
title: View API — mentions through the HTTP surface
label: wayfinder:task
status: closed
assignee: claude-orchestrator
blocked-by: [T2]
---

## Question

(Execution slice; blocked by T2 so roster-validation logic is shared, not duplicated —
extract a domain helper if T2 didn't already.) TDD in `app.e2e.test.ts` (view section):

- `POST /api/rooms/:id/messages` body gains `mentions?: string[]` — same roster
  validation and loud 400 on unknown names as the tool.
- Message payloads already flow `StoredMessage` through `GET /api/rooms/:id` and the
  SSE stream — assert `mentions` survives both paths end-to-end.
- e2e: post with mentions from the view, watch the mention arrive over the live stream,
  unknown-name 400.

## Resolution (2026-08-31)

Implemented as specified (codex coded; orchestrator wrote the failing e2e first — red
confirmed — reviewed, gated).

- Roster-validation extracted to `invalidMention(room, mentions?)` in `domain/types.ts`
  (next to `canAccess`); both `tools.ts` send_message and the view post now use it —
  one rule, two surfaces.
- `POST /api/rooms/:id/messages` takes `mentions?: string[]` (zod); validation runs
  after the canAccess gate but **before** send-joins-first, so a failed send never
  records membership; unknown name → 400 `"<name> is not a member of this room"`.
- `mentions` survives both read paths untouched (`GET /api/rooms/:id` and the SSE
  stream pass `StoredMessage` through whole) — asserted end-to-end.
- Gates: 93 tests green (+1 e2e), typecheck + lint clean.
