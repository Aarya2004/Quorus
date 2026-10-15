---
status: accepted
---

# Small core, capabilities at the edges

Decided 2026-10-15 with Aarya, after comparing this rebuild with the Python v1 that
continues upstream (Quorus-dev/Quorus). v1 grew to ~51k lines by putting every
capability in the relay: locks, approvals, agent memory, capability registry, task
bidding, a wake daemon wired to relay endpoints. The tenet for the rebuild is the
opposite: **keep the server small and fast, and scalable when we reach that point.**

## Decision

**The test for any new capability: can it work without the server knowing about it?**
If yes, it lives at the edge — a CLI, a local daemon, or a convention over Messages —
and talks to the server over MCP like any other Member. Only what *cannot* be built
that way goes into the server.

Applied to the v1 features worth taking:

- **Agent setup** (`connect`) is a local CLI that writes each agent's MCP config. The
  server is unchanged; the CLI is not part of the server bundle.
- **Waking agents** (v1's `reflexd`) becomes a local daemon that is an ordinary Member:
  it polls `get_messages` with `mentions_me` and starts the agent. Zero server changes;
  scales by adding machines. Needs its own ADR because it changes ADR 0006.
- **Owner approvals** become a convention: the daemon posts a request that mentions the
  owner and waits for a reply. No approval endpoints or server-side state.

Everything else in v1's relay (locks, shared state, memory, capabilities, bids, work
queues, tenants, dashboard) stays out until a real need survives this test.

## Keeping the scaling seams open

We do not build for scale now. We keep the swap points working:

| Single-node limit | Seam | Swap when outgrown |
|---|---|---|
| SQLite single writer | `Store` + `store-contract.ts` | A Postgres `Store` passing the same contract |
| In-process fan-out | `ServerEventBus` (`subscriptions.ts`) | A pub/sub bus (Postgres `LISTEN/NOTIFY`, Redis) |
| Session state | none (ADR 0007) | nothing — already horizontal |
| Unbounded history | per-Room `seq` | cold segments by seq range |

Two rules protect them:

1. **No new in-memory server state** beyond the event bus. It is what would pin us to
   one node.
2. **Every server feature goes through `Store` and the contract suite.** No
   backend-specific queries in tools or views.

## Considered options

- **Port v1's relay features into the server.** Rejected: each one adds endpoints,
  state, and tests that every deploy carries, whether or not it is used — the v1 path.
- **A plugin system in the server.** Rejected as speculative: MCP already is the
  extension surface; an edge program is a Member.

## Consequences

- The server's growth is bounded by what genuinely needs shared, durable state.
- Edge tools carry their own complexity (per-agent config formats, process
  management) and their own tests, and can be deleted without touching the core.
- Some features are slower than a server-side version would be (a daemon polls
  instead of receiving a push). Accepted until a client acts on pushes (ADR 0006).
