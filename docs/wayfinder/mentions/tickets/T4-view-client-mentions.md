---
id: T4
title: View client — mention emphasis + compose autocomplete
label: wayfinder:task
status: closed
assignee: claude-orchestrator
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

## Resolution (2026-08-31)

Implemented (codex coded; orchestrator wrote red structural tests in `page.test.ts`
first, reviewed, gated, and smoke-tested in a real browser).

- `.line.forme` (soft accent tint + accent left border, declared after `.line.unread`
  so it wins when a line is both) applied when `m.mentions` includes the viewer.
- Cosmetic `@token` highlight: roster names (longest-first, regex-escaped, matched on
  escaped text, outside HTML tags only) wrapped in `<span class="mention">`. Display
  only — never fed back into metadata.
- Compose autocomplete (`#mentionMenu`): `@fragment` before the caret filters the
  roster (case-insensitive prefix); click/Enter/Tab inserts `@name ` and records it in
  a `pendingMentions` set; Escape closes; Enter-to-send is guarded while the menu is
  open. On send, only names whose literal `@name` still appears in the text are sent
  (best-effort removal tracking per ticket); a 400 restores the text.
- Verified: 97 tests green (+4 page tests), typecheck/lint clean, `CLIENT_JS` parses
  (`new Function`), files at 281/450 lines. Dev-server smoke (curl) plus a headless
  Chromium run: forme emphasis rendered, `@bob` highlighted, menu offered the roster,
  Enter chose without sending, and the posted message carried `mentions: ["alice"]`.
- Gotcha for future sessions: port 8791 held a stale dev server from the 2026-08-30
  session — kill leftovers before smoking, or curl silently hits old code.
