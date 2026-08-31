---
id: T5
title: Docs current + dogfood rollover
label: wayfinder:task
status: open
assignee:
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
