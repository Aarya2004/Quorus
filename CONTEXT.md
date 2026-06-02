# Quorus — Shared Context

> **This file is the shared memory between all contributors' Claude instances.**
> Read this at session start. Update it after every significant change. Commit it with your work.

Last updated: 2026-06-02 (grill-with-docs — resolved auth design: fail-closed per-Member token auth, dev-only open mode; ADR 0005)

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

**Member Token**:
A per-Member credential a connection presents to prove which Member it is. The token *derives* identity (the server maps token → Member); a self-asserted name does not. The unit of access — minting one admits a Member, revoking one removes them.
_Avoid_: API key, Password, Shared secret (it is not shared)

**Orchestrator**:
The role most agent Members are expected to play: a planner that speaks for a whole local swarm of implementer agents on its own machine. A usage convention, not a distinct type — an Orchestrator is a Member; not every Member is an Orchestrator (a human Member is not). Quorus connects Orchestrators; the implementer agents behind one are invisible to it.
_Avoid_: Coordinator, Manager, Lead agent

**Membership**:
The set of Members that belong to a Room, recorded when they join. Distinct from presence (who is currently active).
_Avoid_: Roster, Attendance

**Message**:
A single communication posted by a Member into a Room. Ordered within its Room by a monotonic `seq`.
_Avoid_: Post, Note, Chat

**Seq**:
A per-Room monotonic integer assigned to each Message. Serves as the total order and the catch-up cursor ("give me everything after seq N").
_Avoid_: Index, Offset, ID

**Retention**:
The policy governing how long a Room's Messages are kept. Default: indefinite — bounded in practice by the deploy's storage (e.g. the Fly volume size), not by a time policy. No eviction yet.
_Avoid_: Expiry, TTL, Cleanup

## Relationships

- A **Room** has many **Members**; a **Member** may belong to many **Rooms**.
- A **Member** is usually an **Orchestrator** (an agent) or a human; the same Room can hold both.
- **Hub-to-hub**: each machine runs its own hub-and-spoke swarm (one Orchestrator, many hidden implementers); Quorus connects the *hubs* across machines. Coordination is **between Orchestrators**, not between implementers.

## Example dialogue

> **Aarya:** "When my Orchestrator and Arav's coordinate, do the worker agents join the Room too?"
> **Arav:** "No — only the Orchestrators are Members. My workers are an internal detail of my hub; yours can't see them. The Room is where the two planners exchange intent, and we humans can sit in it to watch and steer."

## Flagged ambiguities

- "Agent" was used for both *an implementer worker* and *the thing that joins a Room*. Resolved: the thing that joins is a **Member**, and the agent Member we expect is an **Orchestrator**; implementer workers are not Members.

---

## Positioning Hypothesis (unvalidated — dogfood-first)

> Treated as a hypothesis to test by using it ourselves, **not** an enshrined strategy. The
> "AI agents message each other" niche is currently unvalidated: competitor traction is
> influencer/blog-driven, not usage-driven (MCP Agent Mail ~2k★ via Steve Yegge amplification;
> AgentDM is a ~2.5-month landing page with an 11★ top repo and a 6-point Show HN; claude-mesh,
> cc2cc, session-bridge are dead 1–2-day projects). The one commercial win in "agent
> communication" (AgentMail, YC S25) solved a *more concrete* problem — email inboxes for agents.

**The bet:** Quorus is a coordination fabric for AI **Orchestrators across machines**. Each
machine runs its own hub-and-spoke swarm; Quorus connects the *hubs*. The un-taken ground vs.
every traction-having competitor (all Claude-only and agent-only) is:

1. **Orchestrator-tier** coordination (planners exchanging intent), not flat implementer DMs.
2. **Humans join Rooms to view and steer** their swarm — the bridge to a future paid dashboard.
3. **Cross-client** — Claude Code ↔ Cursor ↔ Codex ↔ any MCP client, not Claude-to-Claude only.

**Validation plan:** Aarya + Arav are the target user (two co-founders, two machines, parent-agent
workflows). Ship the cheapest cross-machine + human-view path, dogfood 1–2 weeks, then reassess
before investing further. The motivating user story: levelsio asking "why can't Claude Code
sessions message each other?" while copy-pasting between SSH windows by hand.

**Delivery (v1):** pull / loop — agents call `get_messages` when prompted (a `/loop` or cron does
the poke). A Channels-style interrupt that wakes an idle agent (`notifications/claude/channel`) is
a *later, optional per-machine adapter* kept out of the transport-agnostic server core.

**Deferred by this thesis:** advisory leases/locks — Orchestrators on different machines/repos
don't collide on files, so messaging is the primitive, not mutual exclusion. Revisit only if a
Room ever spans a shared working tree.

---

## Current State

Quorus is a coordination fabric for AI agent swarms — Rooms that Orchestrators on different
machines (and the humans steering them) join over MCP.

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

**Stack:** TypeScript / Node ≥22.13 (24 LTS), `@modelcontextprotocol/sdk` (Streamable HTTP), Hono + `@hono/mcp`,
zod, `node:sqlite`, Vitest, Biome, npm.

**Run:** `npm test` · `npm run typecheck` · `npm run lint` · `npm run dev` (server on `:8787`,
SQLite at `./data/quorus.db`).

**How an agent connects:** add the server URL as a remote MCP server with an `x-quorus-member`
header carrying its Member name. Identity is bound per connection — no tool takes a `from` arg.

---

## In Progress

Iteration 0 + logging + **persistence (SQLite)** complete. Reordered for **dogfood-first**
validation of the Positioning Hypothesis (above) — get Aarya + Arav coordinating cross-machine,
cheaply, before investing further:

1. **Cheapest cross-machine path** — **LIVE** at `https://quorus.fly.dev`
   (Fly, region `yyz`, scale-to-zero, 3 GB volume). Health + MCP 401-gate
   verified. Remaining: **land per-Member token auth before any real dogfood**
   (un-gated host is smoke-test only — ADR 0004 / deploy.md auth gate).
   Design resolved (grill-with-docs 2026-06-02): two modes — `token` (prod,
   identity from a bearer Member Token) and `open` (dev, identity from the
   `x-quorus-member` header). Fail-closed: no config refuses to boot;
   `QUORUS_INSECURE=true` enables open mode but is itself refused on a Fly
   target (`FLY_APP_NAME` present). See ADR 0005.
2. **Human view** — a read-only way for a human to watch/steer a Room (start simple: a `get_messages`
   loop or the `website/` app wired as a read-only dashboard).
3. **Delivery polish** — `wait` mode on `get_messages` (long-poll, universal) now; a Channels-style
   interrupt adapter (`notifications/claude/channel`) later, kept out of the server core.
4. **— reassess after dogfooding —** does the orchestrator-tier + human-steer + cross-client bet
   hold? Only then invest in: Identity/auth, Workspaces, discovery (`list_rooms`), managed quorus.dev.

**Deferred** (per hypothesis): advisory leases/locks; shared goal/decisions primitives.

---

## Recent Changes

| Date       | What                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 2026-06-02 | docs: ADR 0005 — fail-closed per-Member token auth design (grill-with-docs) |
| 2026-05-31 | feat: containerize + Fly deploy (scale-to-zero, 3GB volume); ADR 0004       |
| 2026-05-31 | docs: sharpen positioning — orchestrator-tier, cross-machine, human-steer; dogfood-first |
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
- **Pull/loop** delivery for v1; a Channels-style interrupt adapter (`notifications/claude/channel`) is later and kept out of the transport-agnostic server core.
- **Coordination is between Orchestrators** (hub-to-hub), not between implementer agents; advisory leases/locks deferred — planners on different machines don't collide on files.
- **Positioning is a hypothesis**, validated by Aarya + Arav dogfooding cross-machine before further investment.
- **`Store` seam** from line one so persistence can change without touching the MCP layer.
- **Persistence**: Node's built-in `node:sqlite` (no native addon), single-node (ADR 0002).
- **Deploy host**: one Fly machine, **scale-to-zero**, 3 GB volume for SQLite;
  MCP sessions are ephemeral (cold start drops them) — a 404 after idle is
  expected (ADR 0004). Single-machine is load-bearing (WAL + in-memory sessions).
- **Auth gate**: the deploy ships un-gated; per-Member token auth is a **hard
  prerequisite before real dogfooding**, not an optional follow-up. Identity is
  *derived* from a Member Token, not self-asserted — a shared token was rejected
  because it leaves Member attribution forgeable (the core product bet). Auth is
  **fail-closed**: no config refuses to boot, open mode is an explicit opt-out
  fenced off any production target (ADR 0005).
- MIT licensed.

---

## Contributors

- **Arav** (aravkek) — co-founder, parent Claude directing agents
- **Aarya** (Aarya2004) — co-founder
