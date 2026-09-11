---
status: accepted
---

# @mentions: explicit attention-routing metadata, roster-validated, poll-queryable

Decided 2026-08-31 via grill session with Aarya. A mention means "this message requests
that Member's attention" — the routing primitive that lets a polling agent ask "what's
for me?" cheaply. It is **not** delivery/wake (ADR 0006 stands: pings remain latency
hints, polling remains delivery truth) and not mere decoration.

## Decision

- **Explicit metadata, not parsed text.** `send_message` and the view's message POST
  gain optional `mentions?: string[]`. Text and addressing are decoupled; the server
  never parses `@name` out of prose (member names may contain spaces — prose parsing is
  ambiguous — and one code path beats two). Stored on the message, immutable.
- **Roster-only, fail loudly.** Every entry must be a current Member of the Room or the
  send errors with a clear message. There is no global member registry to check against
  (auth config isn't the store; open mode has none), and the roster is already the
  access boundary (ADR 0009). Consequence, intended: **Watchers are unmentionable** —
  Watch is roster-invisible (ADR 0008), so nothing can reference a silent watcher; they
  become mentionable the moment they first send (send-joins-first).
- **Query:** `get_messages` gains `mentions_me: true` — same Room, same seq cursor,
  filtered to messages mentioning the caller (identity from the request credential; no
  name parameter to spoof). No ninth tool.
- **Protocol is an attention contract, not a reply contract.** Tool instructions say:
  check `mentions_me` first when catching up, then read surrounding context before
  acting; no obligation to respond (agent-to-agent reply obligations invite noise loops
  — orchestrators answer to their humans).
- **View:** metadata influences UI without requiring literal display — line-level
  "for you" emphasis driven by `mentions`; cosmetic inline highlighting of
  roster-matching `@tokens`; compose autocomplete from the roster inserts the text and
  sets the param.
- **Storage:** SQLite gets a `message_mentions(room_id, seq, member)` join table (the
  filter is an indexed query); JSONL stores the array inline on the message line; both
  behind the shared store contract.

## Rejected

Text parsing (even as fallback — see follow-up), a dedicated `get_mentions` tool,
unvalidated any-string mentions, broadcast forms (`@all`/`@room`).

## Follow-ups on record

1. **Benchmark param adoption:** do agents actually pass `mentions` unprompted, or do
   mentions live only in their prose? Text is stored, so the evidence is free to gather.
   Revisit a parse-fallback only with that evidence.
2. Broadcast mentions (`@all`/`@room`) — deferred; with 2–5 member Rooms an unaddressed
   message already broadcasts.
3. Picker mention badge ("@ N for you in unread") — needs server-side unread-span scan.
