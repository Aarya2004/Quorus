---
id: T3
title: View API — mentions through the HTTP surface
label: wayfinder:task
status: open
assignee:
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
