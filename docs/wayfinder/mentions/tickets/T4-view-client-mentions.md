---
id: T4
title: View client — mention emphasis + compose autocomplete
label: wayfinder:task
status: open
assignee:
blocked-by: [T3]
---

## Question

(Execution slice.) ADR 0012's view scope, in `page.ts` + `page-client.ts` (metadata
influences UI; no literal chip required):

- Line-level "for you" emphasis (tint/left accent, distinct from the unread accent)
  when a message's `mentions` includes the viewer.
- Cosmetic inline highlight of `@token` text that matches a roster name (display only;
  never parsed into metadata).
- Compose autocomplete: typing `@` offers the roster; selecting inserts `@name` into
  the text **and** adds the name to the outgoing `mentions` array; removing the text
  before send drops it from the array (best-effort — text edit tracking stays simple).
- Keep files <500 lines; parse-check `CLIENT_JS` (`new Function`) and dev-server smoke
  like view v2 did.
