---
status: accepted
---

# Scale-to-zero host with ephemeral MCP sessions

The Fly deploy runs **one machine that scales to zero** when idle
(`min_machines_running = 0`, `auto_stop_machines = "stop"`). The MCP session map
in `src/server/app.ts` is **in-memory**, so a cold start drops all live
sessions: a request carrying a stale `mcp-session-id` receives
`404 "unknown session"`.

## Decision

Accept ephemeral sessions for the dogfooding phase. The cost is occasional
reconnect noise; the benefit is a near-free host.

This is viable because Quorus sessions are **nearly stateless** — a session
holds only the Member name bound from the `x-quorus-member` header. On a 404 a
client re-`initialize`s, re-supplies the header, and continues; all Rooms,
Membership, and Messages are durable on the SQLite volume. Identity survives the
reconnect.

## Considered options

- **Always-warm (`min_machines_running = 1`, no auto-stop)** — no cold-start
  404s, but pays for an idle machine 24/7. Rejected as premature for a two-user
  dogfood where reconnects are tolerable.
- **`auto_stop_machines = "suspend"`** — Fly snapshots/restores memory, which
  *might* preserve the session map. Untested for this app; not relied on.
- **Durable sessions (persist the map to the store / make tools fully
  stateless)** — the real fix, but server-core work out of scope for a deploy.

## Consequences

- A `404 "unknown session"` after idle is **expected, not a bug** — documented
  in `docs/deploy.md`.
- Clients with poor reconnect behaviour (e.g. a naive `/loop` poller) may drop a
  single poll cycle after a cold start.
- **Revisit before public/alpha hosting.** Under real load, scale-to-zero +
  ephemeral sessions stops being acceptable; move to durable sessions or an
  always-warm machine, and pair it with the auth gate (also a pre-alpha task).
