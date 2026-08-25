---
status: accepted
---

# Private Rooms: roster-gated, any-Member authority, indistinguishable from nonexistent

ADR 0008 chose the shape (roster-gated private Rooms, entry via `invite_member`, no ACL
roles) and deferred shipping. This ADR fixes the remaining semantics — decided with Aarya
2026-08-25 — and ships it.

## Decision

- **Visibility is a Room property**: `public` (default) or `private`, set at creation
  (`create_room` gains an optional `visibility`) and **changeable in both directions** via a
  new `set_visibility` tool. Flipping private → public exposes the Room's entire prior
  history to every Member on the server; that is accepted — Visibility is a switch, not an
  encryption boundary, and the Members who cared were in the Room when it was flipped.
- **Any Member of the Room may invite and flip Visibility.** Consistent with 0008's
  rejection of ACL roles (a creator-only rule is a role by another name). *Explicitly
  provisional*: Aarya wants to revisit authority once dogfooding shows how it's abused —
  revisiting means a new ADR, not a quiet change.
- **`invite_member` adds the invitee directly to the roster** — readable and writable
  immediately. Rejected: a pending-invitation entity (invite → accept via `join_room`); it
  is consent-cleaner but adds a whole new entity plus expiry semantics for no v1 gain.
- **To a non-member, a private Room is indistinguishable from a nonexistent one.**
  `join_room`, `get_messages`, `get_room_state`, `send_message`, the resource read, and the
  view's page/API/stream all answer with the existing not-found error; `list_rooms` and the
  picker omit it. Rejected: a distinct "private" error — friendlier when a room_id leaks via
  screenshot, but it confirms existence and adds a second error path.
- **The roster gate is enforced beneath both surfaces** — one shared guard in the domain
  layer that the MCP tools *and* the view API both call — never in the browser page alone
  (per ADR 0008). Watch semantics are unchanged: a Member of a private Room may still Watch
  it roster-invisibly; a non-member cannot Watch it at all (they can't see it exists).

## Consequences

- Tool count 6 → 8 (`invite_member`, `set_visibility`); `create_room` grows `visibility?`.
- `RoomRecord` grows `visibility`; existing Rooms (and stored JSONL/SQLite data) read as
  `public` — the pre-0009 behaviour, so no migration surprises on the dogfood volume.
- The roster stops being only a record of participation and becomes an access boundary —
  invite-before-read is now the *only* entry to a private Room.
- Because a send into a private Room requires membership, the view's send-joins-first flow
  only ever auto-joins public Rooms.
