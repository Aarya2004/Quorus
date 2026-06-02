# Quorus — Shared Context

> **This file is the shared memory between all contributors' Claude instances.**
> Read this at session start. Update it after every significant change. Commit it with your work.

Last updated: 2026-06-02 (retargeted to OSS-share goal; delivery decision ADR 0006 — manual/poll now, Claude channel later, long-poll rejected; concept validated at YC hackathon)

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

## Positioning (open-source project, not a company)

> **Goal (2026-06-02):** Quorus is a **cool, shareable open-source project** — not a
> company, no paid tier, no managed SaaS, no user-retention metrics. Success = a stranger
> finds it, clones it, and quickly gets the "two agents coordinate across machines" moment.
> This replaces the earlier company-validation framing. The competitor context still holds:
> the "AI agents message each other" niche has no usage-driven traction (MCP Agent Mail
> ~2k★ via amplification; AgentDM a landing page; claude-mesh/cc2cc/session-bridge dead) —
> which is fine, because the bar here is "interesting to share," not "win a market."

**The idea:** a coordination fabric for AI **Orchestrators across machines**. Each machine
runs its own hub-and-spoke swarm; Quorus connects the *hubs*. What makes it worth sharing:

1. **Orchestrator-tier** coordination (planners exchanging intent), not flat implementer DMs.
2. **Humans join Rooms to view and steer** their swarm (a read-only human-view, not a product).
3. **Cross-client** — Claude Code ↔ Cursor ↔ Codex ↔ any MCP client, not Claude-to-Claude only.

The motivating user story: levelsio asking "why can't Claude Code sessions message each
other?" while copy-pasting between SSH windows by hand.

**Delivery — manual/poll now, Claude channel later (ADR 0006):** agents learn of new
Messages by polling `get_messages` (human- or `/loop`-driven). This is an accepted
limitation. We rejected long-poll (`wait` mode) — a held tool call freezes the agent and
blocks it from returning to the human, worse than instant-return polling. **No portable
hands-free delivery exists today**: a true idle-wake is Claude-Code-only
(`notifications/claude/channel`), a buggy research preview — deferred as the *ideal* later
experience, kept an optional layer over the portable poll core.

**Deferred:** advisory leases/locks — Orchestrators on different machines/repos don't
collide on files, so messaging is the primitive, not mutual exclusion. Revisit only if a
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

Iteration 0 + logging + **persistence (SQLite)** + **per-Member token auth** complete.
**The concept is validated** — an earlier (pre-auth) build coordinated cross-machine at a
YC hackathon and worked. So the bet is proven enough to be worth sharing; the goal now is a
polished, shareable OSS project (see Positioning). Roadmap:

1. **Confirm the auth'd build live** — *only unverified piece.* The hackathon ran the
   **pre-auth** build; today's stack (SQLite + token auth) has never run with auth on the
   live host. Auth is DONE in code (ADR 0005) but `QUORUS_TOKENS` isn't set on the deploy,
   so it can't run token-mode yet. **Next step:** `fly secrets set QUORUS_TOKENS='{...}'`,
   redeploy, and run two machines to confirm it still coordinates like the hackathon build
   did (see deploy.md Auth).
2. **Human view** — a read-only way for a human to watch a Room (the shareable artifact: a
   screenshot/video of agents talking). Start simple: a `get_messages` tail, or the
   `website/` app wired as a read-only dashboard. Do *after* step 1.
3. **First-run polish** — README that lands the idea + a one-command local "two agents talk"
   demo, so a stranger gets the moment fast.
4. **Delivery (deferred, ADR 0006)** — stays manual/poll. Long-poll rejected (freezes the
   agent). Claude `claude/channel` wake is the ideal later experience but Claude-only +
   buggy; revisit when it stabilises. No portable hands-free delivery exists today.
4. **— reassess after dogfooding —** does the orchestrator-tier + human-steer + cross-client bet
   hold? Only then invest in: Identity/auth, Workspaces, discovery (`list_rooms`), managed quorus.dev.

**Deferred** (per hypothesis): advisory leases/locks; shared goal/decisions primitives.

---

## Recent Changes

| Date       | What                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 2026-06-02 | docs: retarget to OSS-share goal; ADR 0006 delivery (manual/poll, no long-poll) |
| 2026-06-02 | feat: fail-closed per-Member token auth on /mcp (TDD); deploy.md gate closed |
| 2026-06-02 | docs: ADR 0005 — fail-closed per-Member token auth design (grill-with-docs) |
| 2026-05-31 | feat: containerize + Fly deploy (scale-to-zero, 3GB volume); ADR 0004       |
| 2026-05-31 | docs: sharpen positioning — orchestrator-tier, cross-machine, human-steer; dogfood-first |
| 2026-05-30 | feat: SQLite store (node:sqlite) as default; shared store-contract tests   |
| 2026-05-30 | docs: ADR 0002 — Node's built-in node:sqlite for persistence               |
| 2026-05-29 | feat: structured server logging (lifecycle + tool calls, idle polls debug) |
| 2026-05-28 | feat: iteration 0 — MCP server (5 tools) over Streamable HTTP, JSONL store |
| 2026-05-28 | chore: wipe Python v1; scaffold TypeScript project (Hono + MCP SDK)        |

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
- **Delivery is manual/poll** (ADR 0006). **Long-poll rejected** — a held tool call freezes the agent and blocks it from returning to the human. True idle-wake is Claude-only (`claude/channel`) + buggy; deferred as the ideal-later layer. No portable hands-free delivery exists today.
- **Coordination is between Orchestrators** (hub-to-hub), not between implementer agents; advisory leases/locks deferred — planners on different machines don't collide on files.
- **Goal is a shareable OSS project**, not a company — no paid tier / managed SaaS. The concept was validated at a YC hackathon (pre-auth build); the bar now is "interesting to share," not "win a market."
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
