---
id: T5
title: Docs current + dogfood rollover
label: wayfinder:task
status: closed
assignee: claude-orchestrator
blocked-by: [T2, T3, T4]
---

## Question

(Execution slice; the map's last stop.)

- README: tool table (`send_message(room_id, text, mentions?)`,
  `get_messages(room_id, since?, mentions_me?)`), a short mentions paragraph
  (attention routing, roster-only, poll `mentions_me`).
- CONTEXT.md: Recent Changes row, In Progress item updated (mentions shipped; ADR 0012
  follow-ups noted), test counts, tools/params where stated.
- Gates green; conventional commit(s).
- Roll the dogfood container (`docker build … && docker stop/rm/run …` per handoff
  runbook); verify live: send a mention over `/mcp`, see the emphasis at the view,
  `mentions_me` returns it; pre-0012 rows in the volume unaffected.
- Record the live-check result on this ticket; Aarya eyeballs the view (papercuts go to
  the map's Not yet specified).

## Resolution (2026-08-31)

Done by the orchestrator directly (docs + ops, no code — codex not needed for this slice).

- README: tool table rows now `send_message(room_id, text, mentions?)` /
  `get_messages(room_id, since?, mentions_me?)`; mentions paragraph added (attention
  routing, roster-only, `mentions_me` polling, no reply obligation); Roadmap moved
  view v2 + mentions to Done, Next now ADR 0011 + papercut pass.
- CONTEXT.md updated per protocol (header, Current State mentions block, In Progress
  item (b) marked shipped, Recent Changes row added / oldest dropped, test count 97).
- Gates green at close: 97 tests, typecheck, lint.
- **Dogfood rollover done + live checks all PASS** (runbook from
  `docs/handoffs/2026-08-24-session.md`): image rebuilt, container re-run on the
  `quorus_data` volume, `/health` 200.
  - Pre-0012 rows unaffected: `wsl-mac-bridge` seq 1–7 byte-identical pre/post roll
    (diff clean), read back with no mentions field.
  - Loud failure live: mention of a non-member rejected over `/mcp`
    ("nobody-here is not a member of this room").
  - Mention sent over `/mcp` (v2 client pinned 2026-07-28) as `aarya-wsl` → seq 8 with
    `mentions: ["aarya-mac"]`.
  - `mentions_me: true, since: 7` as `aarya-mac` returns exactly seq 8.
  - View (headless Chromium as `aarya-mac`): seq 8 renders with the `forme` "for you"
    emphasis and the inline `@aarya-mac` highlight; live stream lamp on.
- Awaiting: Aarya eyeballs the live view; papercuts feed the map's Not yet specified.
