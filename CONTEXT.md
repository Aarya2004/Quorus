# Quorus — Shared Context

> **This file is the shared memory between all contributors' Claude instances.**
> Read this at session start. Update it after every significant change. Commit it with your work.

Last updated: 2026-05-30 (rebuild — iteration 0 + server logging + SQLite persistence)

---

## Language

> Glossary governed by the grill-with-docs skill. Definitions only — no implementation detail.

**Room**:
A bounded coordination space that Members join to exchange messages and coordinate. Created explicitly and identified by a stable `room_id`; its name is a human-facing label, not its identity.
_Avoid_: Channel, Space, Session

**DM**:
A Room with exactly two Members. Not a separate feature — the two-member case of a Room, named for convenience.
_Avoid_: Direct chat, Private message, Thread

**Workspace**:
A container that groups multiple Rooms under one owner.
_Avoid_: Org, Team, Project

**Member**:
A named occupant of a Room — human or AI agent. The `from` of every message.
_Avoid_: Participant, User, Agent (as a synonym for occupant)

**Membership**:
The set of Members that belong to a Room, recorded when they join. Distinct from presence (who is currently active).
_Avoid_: Roster, Attendance

**Message**:
A single communication posted by a Member into a Room. Ordered within its Room by a monotonic `seq`.
_Avoid_: Post, Note, Chat

**Seq**:
A per-Room monotonic integer assigned to each Message. Serves as the total order and the catch-up cursor ("give me everything after seq N").
_Avoid_: Index, Offset, ID

---

## Current State

Quorus is the coordination layer for AI agent swarms — real-time Rooms agents join over MCP.

**This is a from-scratch rebuild.** The 48k-line Python v1 (relay + MCP + CLI + TUI + SDK
monorepo) was wiped on 2026-05-28 and is being rebuilt in TypeScript from first principles —
same idea, far simpler, genuinely deployable. The v1 code remains in git history and on `main`.

**Branch:** `claude/continuation-LXpY5`

**Iteration 0 — "the Room" — DONE (19 tests passing).** A single remote server speaks MCP over
Streamable HTTP; agents on any machine connect by pointing their MCP client at the URL. The store
is an append-only JSONL file per Room, behind a `Store` seam so later iterations can swap in
SQLite/Redis untouched.

**Tools (5):** `create_room`, `join_room`, `send_message`, `get_messages`, `get_room_state`.

**Repo layout:**

```
src/
  domain/types.ts        # Room, Member, Message, Seq, errors, limits
  store/store.ts         # Store interface (the persistence seam)
  store/sqlite-store.ts  # SQLite store (node:sqlite) — the server default
  store/jsonl-store.ts   # append-only JSONL store — zero-config dev alternative
  store/store-contract.ts# shared behavioural suite both stores must pass
  log.ts                 # tiny structured logger (level-gated, greppable)
  server/tools.ts        # builds an MCP server with the 5 tools, identity bound per connection
  server/app.ts          # Hono app: /mcp (Streamable HTTP) + /health
  index.ts               # bootstrap: SqliteStore + serve
website/                 # retained Vite+React app — future read-only dashboard
docs/adr/                # architecture decision records
```

**Stack:** TypeScript / Node 20+, `@modelcontextprotocol/sdk` (Streamable HTTP), Hono + `@hono/mcp`,
zod, `node:sqlite`, Vitest, Biome, npm.

**Run:** `npm test` · `npm run typecheck` · `npm run lint` · `npm run dev` (server on `:8787`,
SQLite at `./data/quorus.db`).

**How an agent connects:** add the server URL as a remote MCP server with an `x-quorus-member`
header carrying its Member name. Identity is bound per connection — no tool takes a `from` arg.

---

## In Progress

Iteration 0 + logging + **persistence (SQLite)** complete. Next iterations, in order:

1. **Real-time** — `wait` mode on get_messages (long-poll, universal) and/or a Claude Code **Channel** plugin
2. **Deploy + UX** — Docker + one host, tiny CLI, wire `website/` as read-only dashboard
3. **Coordination** — shared goal/decisions + distributed locks
4. **Identity + Rooms** polish (DM auto-naming, `list_rooms` discovery)

---

## Recent Changes

| Date       | What                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 2026-05-30 | feat: SQLite store (node:sqlite) as default; shared store-contract tests   |
| 2026-05-30 | docs: ADR 0002 — Node's built-in node:sqlite for persistence               |
| 2026-05-29 | feat: structured server logging (lifecycle + tool calls, idle polls debug) |
| 2026-05-28 | feat: iteration 0 — MCP server (5 tools) over Streamable HTTP, JSONL store |
| 2026-05-28 | chore: wipe Python v1; scaffold TypeScript project (Hono + MCP SDK)        |
| 2026-05-28 | docs: ADR 0001 — relay and MCP endpoint are one service                    |
| 2026-05-28 | docs: glossary — Room, DM, Workspace, Member, Membership, Message, Seq     |

---

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)
   └─ MCP client ──Streamable HTTP──▶  Quorus server  (one deployable service)
                                          ├─ /mcp   — 5 tools, identity per connection
                                          └─ Store  — SQLite (default) or JSONL; Postgres/Redis later
```

Any MCP-capable client works with zero per-agent code (no bespoke runners). See `docs/adr/`.

---

## Key Decisions

- **Wipe and rebuild** the Python v1 in TypeScript — same product, much simpler, deployable.
- **One service**: the relay and the MCP endpoint are a single server (ADR 0001).
- **Streamable HTTP** transport; identity bound per connection via `x-quorus-member`.
- **Room identity** is a stable `room_id`; the name is just a label (prevents collisions).
- **Membership** tracked from iteration 0 (roster only); access control deferred.
- **Pull-only** delivery in iteration 0; real-time arrives later via a Claude Code Channel.
- **`Store` seam** from line one so persistence can change without touching the MCP layer.
- **Persistence**: Node's built-in `node:sqlite` (no native addon), single-node (ADR 0002).
- MIT licensed.

---

## Contributors

- **Arav** (aravkek) — co-founder, parent Claude directing agents
- **Aarya** (Aarya2004) — co-founder
