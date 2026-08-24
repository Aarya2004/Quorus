# Quorus — Shared Context

> **This file is the shared memory between all contributors' Claude instances.**
> Read this at session start. Update it after every significant change. Commit it with your work.

Last updated: 2026-08-24 (resumed after ~12-week pause; full doc staleness refresh + new **Landscape** section — MCP spec 2026-07-28 / SDK v2, Claude Channels status, competitor scan)

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

**Watch**:
To read a Room's Messages without joining it. Watching never alters Membership and is invisible to other Members; a watcher who sends a Message becomes a Member (the send joins them first).
_Avoid_: Spectate, Lurk, Observe

**Visibility**:
Whether a Room is open to any Member (public: discoverable, joinable by room_id) or gated to its roster (private: only its Members may read, send, or discover it; entry by invitation).
_Avoid_: Privacy, Access level, Scope

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
> *(Competitor picture refreshed 2026-08-24 — several of those projects are now active and a
> near-identical "Rooms" competitor exists; see **Landscape** below.)*

**The idea:** a coordination fabric for AI **Orchestrators across machines**. Each machine
runs its own hub-and-spoke swarm; Quorus connects the *hubs*. What makes it worth sharing:

1. **Orchestrator-tier** coordination (planners exchanging intent), not flat implementer DMs.
2. **Humans join Rooms to view and steer** their swarm (Watch + send via the human view — a feature, not a product).
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

## Landscape (checked 2026-08-24)

What changed in the world during the June→August pause. Verified against primary sources
(modelcontextprotocol.io changelog, SDK migration docs, code.claude.com, the GitHub issues).

- **MCP spec 2026-07-28** — the largest revision since launch, and it removes what Quorus is
  built on: protocol sessions (`Mcp-Session-Id`) and the `initialize` handshake are **gone**
  from Streamable HTTP. Identity-per-connection must become explicit server-minted handles
  passed as ordinary tool arguments (fits the Member-Token model well). New
  `subscriptions/listen` provides a sanctioned server→client push stream — a future delivery
  path beyond polling — and an official Tasks extension covers long-running waits.
- **TypeScript SDK v2** — the monolithic `@modelcontextprotocol/sdk` is split into
  `@modelcontextprotocol/server` / `client` / `core` plus adapters, including an **official
  Hono adapter** (likely supersedes `@hono/mcp`). Requires zod ^4 (we already are). A codemod
  exists; v1 is supported ~6 more months and interoperates with v2 clients — no fire drill,
  but new work is pointed at v2. → *migrated 2026-08-24 (ADR 0007).*
- **Claude Channels** — `claude/channel` is now a documented research preview (incl.
  permission relay), but the **idle-wake bug is still open**
  (anthropics/claude-code#44380): messages queue until the agent's next turn instead of
  waking it. ADR 0006's manual/poll decision stands unchanged.
- **Competitors woke up** — **ExaDev/agent-comms** ("Rooms, DMs, presence — cross-harness")
  is a near-verbatim Quorus pitch; **claude-mesh** revived as relay + channels + permission
  relay; **MCP Agent Mail** added cross-project contact handshakes; **AgentDM** is hosted and
  speaks MCP + A2A. **A2A** hit v1.0.1 (150+ orgs) and moved into a new Agentic AI Foundation
  (2026-08-17); consensus: MCP for agent↔tools, A2A for enterprise peer agents. Cross-machine,
  human-observable Rooms over plain MCP is still an open slice — but first-run polish is now
  urgent, not optional.
- **Stack/infra** — Node 24.19 LTS current; `node:sqlite` still Release Candidate (fine as-is);
  Hono still v4. Fly.io moved to pure pay-as-you-go: scale-to-zero stops compute billing but
  the 3 GB volume bills continuously (a few $/mo floor).

---

## Current State

Quorus is a coordination fabric for AI agent swarms — Rooms that Orchestrators on different
machines (and the humans steering them) join over MCP.

**This is a from-scratch rebuild.** The 48k-line Python v1 (relay + MCP + CLI + TUI + SDK
monorepo) was wiped on 2026-05-28 and is being rebuilt in TypeScript from first principles —
same idea, far simpler, genuinely deployable. `main` **is** the rebuild; the v1 code remains
only in git history (commits before `088cfc2`).

**Branch:** `main`

**Iteration 0 — "the Room" — DONE, now on MCP 2026-07-28 (52 tests passing).** A single remote
server speaks MCP over Streamable HTTP — spec revision 2026-07-28 (stateless, identity per
request), with the SDK's built-in stateless fallback serving 2025-era clients (ADR 0007). The
store is SQLite (`node:sqlite`) behind a `Store` seam; an append-only JSONL implementation is
kept as the zero-config dev alternative, and both must pass one shared contract suite.

**Tools (5):** `create_room`, `join_room`, `send_message`, `get_messages`, `get_room_state`.
**Resource:** each Room is readable as `quorus://room/<room_id>` and subscribable — a
`subscriptions/listen` stream gets an updated-ping when a Message lands (latency hint only;
delivery truth stays the `get_messages` seq cursor, ADR 0006/0007).

**Repo layout:**

```
src/
  domain/types.ts        # Room, Member, Message, Seq, errors, limits
  store/store.ts         # Store interface (the persistence seam)
  store/sqlite-store.ts  # SQLite store (node:sqlite) — the server default
  store/jsonl-store.ts   # append-only JSONL store — zero-config dev alternative
  store/store-contract.ts# shared behavioural suite both stores must pass
  config.ts              # fail-closed auth config loader (ADR 0005)
  log.ts                 # tiny structured logger (level-gated, greppable)
  suppress-warnings.ts   # load-order-sensitive Node warning filter — looks deletable; isn't
  server/tools.ts        # MCP server factory: 5 tools + Room resource; identity bound per request
  server/app.ts          # Hono app: auth + /mcp (Streamable HTTP) + /health
  index.ts               # bootstrap: loadAuthConfig + SqliteStore + serve
  *.test.ts              # 52 tests: store contract ×2 backends, auth config, logger, tools, HTTP e2e (modern + legacy eras)
website/                 # Vite+React marketing site — content still markets Python v1 (STALE);
                         #   future read-only dashboard. Has a manual Vercel deploy workflow —
                         #   do not dispatch it until the content is rewritten.
docs/adr/                # architecture decision records (0001–0006)
docs/deploy.md           # Fly deploy + auth runbook
Dockerfile, fly.toml     # container + single Fly machine, volume at /data
.env.example             # QUORUS_TOKENS / QUORUS_INSECURE
```

**Stack:** TypeScript / Node ≥22.13 (24 LTS), `@modelcontextprotocol/server` (SDK v2, spec 2026-07-28 + legacy fallback), Hono,
zod, `node:sqlite`, Vitest, Biome, esbuild (build) + tsx (dev). Package manager: **Bun**
(`bun install`); runtime stays Node. (`website/` is separately npm-managed.)

**Run:** `npm test` · `npm run typecheck` · `npm run lint` · `npm run dev` (server on `:8787`,
SQLite at `./data/quorus.db`; `dev` sets `QUORUS_INSECURE=true` — open auth mode) ·
`npm run build` (esbuild bundle, used by the Dockerfile).

**Env vars:** `QUORUS_TOKENS` / `QUORUS_INSECURE` (auth, ADR 0005) · `QUORUS_DB_PATH` (SQLite
file) · `QUORUS_DATA_DIR` (JSONL dir) · `QUORUS_LOG_LEVEL` · `PORT`.

**How an agent connects:** add the server URL as a remote MCP server. Local dev (open mode):
an `x-quorus-member` header carries the Member name. Deployed (token mode): `Authorization:
Bearer <member-token>` — identity is *derived* from the token, and a contradicting member
header is rejected. Either way identity is bound per connection — no tool takes a `from` arg.

---

## In Progress

Iteration 0 + logging + **persistence (SQLite)** + **per-Member token auth** complete.
**The concept is validated** — an earlier (pre-auth) build coordinated cross-machine at a
YC hackathon and worked. So the bet is proven enough to be worth sharing; the goal now is a
polished, shareable OSS project (see Positioning). *Work paused 2026-06-02 → resumed
2026-08-24 (docs refreshed; local stack smoke-tested end-to-end: session → create_room →
send → poll all work).* Roadmap:

1. **Confirm the auth'd build live — ✅ DONE (2026-08-24, via self-host).** A 24/7
   dogfood deploy runs as a Docker container (`--restart unless-stopped`, named volume at
   `/data`) on Aarya's WSL box `aarya-desktop`, reachable over Tailscale at
   `100.69.22.8:8787`. Token mode verified over the tailnet (bad token → 401, valid token
   with contradicting `x-quorus-member` → 401, valid token → session), and **cross-machine
   coordination re-proven with auth on**: `aarya-wsl` (WSL) and `aarya-mac` (macOS, Claude
   Code) exchanged Messages seq 1–3 in Room `r_6d8ea3db436df3ef` ("wsl-mac-bridge"), with
   Member attribution derived from tokens on both sides. Tokens live in the gitignored
   `.env` (3 Members: `aarya-wsl`, `aarya-mac`, `aarya`). **Open question:** the Fly deploy
   still has no `QUORUS_TOKENS` set — decide whether it stays the shareable public URL or
   gets retired in favour of the self-host.
2. **Human view — IN PROGRESS, design settled 2026-08-24 (ADR 0008, grill-with-docs).**
   Watch + steer, served by the Quorus server itself (`/` Room picker + `/room/<id>` beside
   `/mcp`; `website/` stays marketing-only). Member-Token prompt stored locally (never in
   the URL); any Member may Watch any Room; Watching is roster-invisible, sending joins
   first. Live via a server-sent stream off the internal ping bus; newest ~200 Messages
   eager, older lazy-loaded (needs backward pagination at the `Store` seam); minimal
   markdown (code/bold/links, strict escaping); bare compose with a "posting as" chip.
   Ships `list_rooms` (MCP tool + picker source → 6 tools). Styled as the demo
   centerpiece — first draft to be ratified by Aarya.
   **Next after this ships (priority):** (a) **private Rooms** — roster-gated, changeable
   Visibility, entry via `invite_member`; deliberately the simple alternative to ACL roles,
   implementation must stay simple (v1 of the view is public-only, Visibility fixed at
   creation); (b) **`@mention`s** in compose — routing semantics to be designed (today
   nothing routes; agents poll everything).
3. **First-run polish** — README that lands the idea + a one-command local "two agents talk"
   demo, so a stranger gets the moment fast. *Urgency up: a near-identical competitor
   (ExaDev/agent-comms) now exists — see Landscape.*
4. **MCP 2026-07-28 / SDK v2 migration — ✅ DONE (2026-08-24, ADR 0007, TDD).** Identity is
   per-request (Bearer → Member on every call; sessions Map deleted, the ADR 0004 cold-start
   404 gone for modern clients). Rooms are subscribable resources; `send_message` publishes an
   updated-ping to open `subscriptions/listen` streams. Legacy 2025-era clients are served by
   the SDK's stateless fallback — verified in e2e with the v1 client.
5. **Delivery (deferred, ADR 0006)** — stays manual/poll. The server now *emits* pings, but no
   client turns a notification into an agent turn yet (Claude Code refreshes caches only;
   Channels can't ride 2026-07-28 — claude-code#44380 still open). Revisit when a client acts
   on resource-updated pings.
6. **— reassess after dogfooding —** does the orchestrator-tier + human-steer + cross-client bet
   hold? Only then invest in: Workspaces, discovery (`list_rooms`), managed quorus.dev.

**Deferred** (per hypothesis): advisory leases/locks; shared goal/decisions primitives.


---

## Recent Changes

| Date       | What                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 2026-08-24 | docs: ADR 0008 — human view design (watch+steer in-server, roster-invisible Watch); glossary Watch/Visibility |
| 2026-08-24 | feat: MCP 2026-07-28 / SDK v2 — per-request identity, Rooms as subscribable resources, legacy fallback (ADR 0007, TDD) |
| 2026-08-24 | docs: primary-source research — MCP SDK v2 GA (2.0.0, 2026-07-27) + 2026-07-28 spec migration facts (`docs/research/2026-08-24-mcp-sdk-v2-migration.md`) |
| 2026-08-24 | ops: 24/7 dogfood deploy — Docker on WSL (`aarya-desktop`) over Tailscale; token auth verified live |
| 2026-08-24 | docs: full staleness refresh (all docs vs code); Landscape section (MCP 2026-07-28 spec, SDK v2, competitors, Channels) |
| 2026-06-02 | docs: retarget to OSS-share goal; ADR 0006 delivery (manual/poll, no long-poll) |
| 2026-06-02 | feat: fail-closed per-Member token auth on /mcp (TDD); deploy.md gate closed |
| 2026-06-02 | docs: ADR 0005 — fail-closed per-Member token auth design (grill-with-docs) |
| 2026-05-31 | feat: containerize + Fly deploy (scale-to-zero, 3GB volume); ADR 0004       |
| 2026-05-31 | docs: sharpen positioning — orchestrator-tier, cross-machine, human-steer; dogfood-first |

---

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)
   └─ MCP client ──Streamable HTTP──▶  Quorus server  (one deployable service)
                                          ├─ auth   — Bearer token → Member (fail-closed, ADR 0005)
                                          ├─ /mcp   — 5 tools, identity per connection
                                          └─ Store  — SQLite (default) or JSONL; Postgres/Redis later
```

Any MCP-capable client works with zero per-agent code (no bespoke runners). See `docs/adr/`.

---

## Key Decisions

- **Wipe and rebuild** the Python v1 in TypeScript — same product, much simpler, deployable.
- **One service**: the relay and the MCP endpoint are a single server (ADR 0001).
- **Streamable HTTP** transport, spec 2026-07-28 (ADR 0007): identity bound **per request**
  from the credential (Bearer token, or `x-quorus-member` in dev open mode); 2025-era clients
  served by the SDK's stateless legacy fallback.
- **Room identity** is a stable `room_id`; the name is just a label (prevents collisions).
- **Membership** tracked from iteration 0 (roster only). Access control is no longer
  deferred indefinitely: private Rooms (roster-gated, ADR 0008) are a committed roadmap
  item, at which point the roster becomes an access boundary, not just a record.
- **Delivery is manual/poll** (ADR 0006). **Long-poll rejected** — a held tool call freezes the agent and blocks it from returning to the human. True idle-wake is Claude-only (`claude/channel`) + buggy; deferred as the ideal-later layer. No portable hands-free delivery exists today.
- **Coordination is between Orchestrators** (hub-to-hub), not between implementer agents; advisory leases/locks deferred — planners on different machines don't collide on files.
- **Goal is a shareable OSS project**, not a company — no paid tier / managed SaaS. The concept was validated at a YC hackathon (pre-auth build); the bar now is "interesting to share," not "win a market."
- **`Store` seam** from line one so persistence can change without touching the MCP layer.
- **Persistence**: Node's built-in `node:sqlite` (no native addon), single-node (ADR 0002).
- **Deploy host**: one Fly machine, **scale-to-zero**, 3 GB volume for SQLite;
  MCP sessions are ephemeral (cold start drops them) — a 404 after idle is
  expected (ADR 0004). Single-machine is load-bearing (WAL + in-memory sessions).
- **Auth is implemented and fail-closed** (ADR 0005, landed 2026-06-02): identity is
  *derived* from a per-Member Token, not self-asserted — a shared token was rejected
  because it leaves Member attribution forgeable (the core product bet). No config
  refuses to boot; open mode is an explicit `QUORUS_INSECURE=true` opt-out, fenced
  off any production target by two tripwires (`FLY_APP_NAME`, `NODE_ENV=production` —
  the Docker image sets the latter). Remaining: set `QUORUS_TOKENS` on the deploy.
- MIT licensed.

---

## Contributors

- **Arav** (aravkek) — co-founder, parent Claude directing agents
- **Aarya** (Aarya2004) — co-founder
