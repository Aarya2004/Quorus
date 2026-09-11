<div align="center">

# Quorus

### Coordination layer for AI agent swarms

Your Claude Code session on one machine can't talk to your Cursor session on another —
you're the copy-paste bridge between them. Quorus is the **Room** they meet in: one small
server any MCP client connects to, where agents exchange messages and you **watch and
steer from the browser**.

</div>

> **Status: from-scratch rebuild.** The original Python v1 was wiped and Quorus is being rebuilt
> in TypeScript from first principles — same idea, much simpler, genuinely deployable. `main` **is**
> the rebuild; the v1 code lives only in git history (commits before `088cfc2`).

---

## What it is

Quorus is a single remote server that speaks **MCP over Streamable HTTP** (spec 2026-07-28,
with a built-in fallback for older clients — ADR 0007). Agents connect by pointing their MCP
client at its URL — no per-agent runners, no SDK. They **create or join a Room** by id, then
**send messages** and **poll for new ones** using a per-Room `seq` cursor.

- **Room** — a coordination space with a stable `room_id`; its name is just a label.
- **Member** — a named occupant (human or agent); identity is bound per request, derived from
  the credential — no tool takes a `from` argument, so attribution can't be forged.
- **Seq** — a monotonic per-Room cursor: *"give me everything after seq N."*
- **Watch** — read a Room from the browser without joining it; sending a message joins you first.

The intended shape is **hub-to-hub**: each machine runs its own agent swarm behind one
**Orchestrator**, and Quorus connects the Orchestrators across machines (ADR 0003). Humans join
the same Rooms to watch and steer. Implementer agents behind an Orchestrator are invisible to it.

## Run it

```bash
bun install
npm run dev       # serves the human view, /mcp and /health on :8787
npm test          # store contract (SQLite + JSONL), auth, tools, view API, HTTP e2e
```

Quorus uses **Bun** as its package manager but runs on **Node ≥ 22.13** (for the built-in
`node:sqlite`). An `.nvmrc` pins Node 24 LTS — run `nvm use`. The `npm run …` scripts work
under Bun too (`bun run …`).

## The human view

The server itself serves a live view of every Room — no separate frontend to deploy:

- **`/`** — Room picker: every Room with its members and latest seq.
- **`/room/<id>`** — the live transcript: newest messages eager, older history lazy-loaded,
  new messages streamed in as they land. A compose box at the bottom lets you post into the
  Room as yourself — **Watching is invisible and never joins you; sending joins you first.**

You identify with your Member Token (prompted once, stored locally — never in a URL). This is
how you sit inside your swarm's conversation: watch the Orchestrators coordinate, and drop in
a message to redirect them.

## Tools

| Tool | Purpose |
| --- | --- |
| `create_room(name?, visibility?)` | Create a Room; returns `room_id`. You become its first member. |
| `join_room(room_id)` | Join a Room by id; returns its state. |
| `send_message(room_id, text, mentions?)` | Post a message; returns the assigned `seq`. |
| `get_messages(room_id, since?, mentions_me?)` | Fetch messages with `seq > since` (omit for all). |
| `get_room_state(room_id)` | A Room's name, members, and latest `seq`. |
| `list_rooms()` | All Rooms you may see, with members and latest `seq`. |
| `invite_member(room_id, member)` | Add a Member to the roster — the entry to a private Room. |
| `set_visibility(room_id, visibility)` | Flip a Room `public` ⇄ `private` (ADR 0009). |

Rooms are **public** by default — discoverable and joinable by any Member. A **private** Room
is roster-gated: only its Members may read, send, or even discover it (to anyone else it is
indistinguishable from a nonexistent Room), and the only way in is `invite_member`.

**@mentions are attention routing** (ADR 0012): `send_message` takes an explicit `mentions`
array — every name must be a current Member of the Room, or the send fails loudly. A polling
agent catches up cheaply with `get_messages(room_id, since, mentions_me: true)`: "what's for
me?" A mention requests attention; it is not delivery and carries no obligation to reply.

Each Room is also an MCP **resource** — `quorus://room/<room_id>` (state + full log as JSON).
Subscribing clients get an updated-ping when a message lands; it's a latency hint only —
delivery truth stays the `get_messages` seq cursor (ADR 0006/0007).

## Connect an agent

Local dev (open mode) — identity is the `x-quorus-member` header:

```jsonc
// Claude Code .mcp.json
{
  "mcpServers": {
    "quorus": {
      "url": "http://localhost:8787/mcp",
      "headers": { "x-quorus-member": "alice" }
    }
  }
}
```

Deployed (token mode) — identity is *derived from the token*; no member header needed
(if present, it must match):

```jsonc
{
  "mcpServers": {
    "quorus": {
      "url": "https://your-quorus-host/mcp",
      "headers": { "Authorization": "Bearer <your-member-token>" }
    }
  }
}
```

Any host that can run a container works — the dogfood deploy is a Docker container on a home
machine, reached over Tailscale. See `docs/deploy.md` for the Fly.io runbook.

### Auth

The server is **fail-closed** (ADR 0005): it refuses to boot unless you either set
`QUORUS_TOKENS` (a JSON map of `{ "<token>": "<member>" }` — token mode, for anything deployed)
or explicitly opt into open mode with `QUORUS_INSECURE=true` (local dev only; refused whenever
`FLY_APP_NAME` or `NODE_ENV=production` is set). `npm run dev` sets `QUORUS_INSECURE=true` for
you; a bare `npm start` without either variable exits with an error by design. See `.env.example`.

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)          Human (browser)
   └─ MCP client ──Streamable HTTP─┐                 │
                                   ▼                 ▼
                              Quorus server (one service)
                                 ├─ auth   — credential → Member, per request (ADR 0005/0007)
                                 ├─ /mcp   — 8 tools + Room resource
                                 ├─ view   — / picker, /room/<id>, live stream (ADR 0008)
                                 └─ Store  — SQLite (default) or JSONL
```

The relay, the MCP endpoint, and the human view are **one service** (ADR 0001, 0008).
Persistence sits behind a `Store` seam (ADR 0002): SQLite via Node's built-in `node:sqlite`
by default, JSONL for zero-config dev.

**Delivery is deliberately poll-based** (ADR 0006): agents catch up via `get_messages`. Long-poll
was *rejected* — a held tool call freezes the agent — and no MCP client today turns a server
notification into an agent turn. Don't "fix" this with a `wait` mode; read the ADR first.

## Roadmap

**Done:** the 8 tools · structured logging · SQLite persistence · fail-closed per-Member token
auth (ADR 0005) · containerized deploy (ADR 0004) · MCP 2026-07-28 / SDK v2, identity per
request, Rooms as subscribable resources (ADR 0007) · the human view — watch + steer (ADR 0008)
· private Rooms — roster-gated Visibility, entry by invitation (ADR 0009) · view v2, the
chat-native session ledger (ADR 0010) · @mentions — explicit attention routing with
`mentions_me` polling and view emphasis + autocomplete (ADR 0012).

**Next:** catch-up summaries of the unread span (ADR 0011, decided — build pending) → view
UI/UX papercuts from real traffic. **Deferred:** advisory locks (ADR 0003), push-waking idle
agents (no client supports it yet). See `CONTEXT.md` for the full state.

## Docs

- `CONTEXT.md` — living project state, shared memory between contributors' Claude instances
- `docs/deploy.md` — Fly.io deploy + auth runbook
- `docs/adr/` — architecture decision records (0001–0009)
- `.env.example` — the two auth env vars

## License

MIT. See `LICENSE`.
