---
status: accepted
---

# Migrate to MCP 2026-07-28 / SDK v2: per-request identity, notifications as hints

MCP spec revision 2026-07-28 removed protocol sessions (`Mcp-Session-Id`, the
`initialize` handshake) from Streamable HTTP — the exact mechanism our
"identity bound per connection" design rides on — and SDK v2 (GA 2026-07-27)
made stateless per-request servers the default shape. We migrate rather than
sit on the supported-but-sunsetting v1 line, because the stateless model is a
net *simplification* for us and the migration unlocks a sanctioned
server→client notification stream. Facts and sources:
`docs/research/2026-08-24-mcp-sdk-v2-migration.md`.

## Decision

- **Identity moves from per-session to per-request.** The Hono route resolves
  the Member from the `Authorization: Bearer` token (or `x-quorus-member` in
  dev open mode) on **every request** and passes it via `handler.fetch(req,
  { authInfo })`; tools read it from ctx. The spec already requires the token
  on every request, so nothing new is asked of clients. The per-session
  `McpServer` map, `Mcp-Session-Id` plumbing, and the ADR 0004 "404 after
  cold start" behaviour are deleted — a scale-to-zero cold start now loses
  nothing. Tools still never take a `from` argument (the core attribution
  guarantee is unchanged); `room_id` remains our SEP-2567-style server-minted
  handle.
- **Stack:** `@modelcontextprotocol/server` + `@modelcontextprotocol/hono`
  (official adapter, `createMcpHandler` factory-per-request) replace
  `@modelcontextprotocol/sdk` + `@hono/mcp` (third-party, peer-pinned to SDK
  v1). zod stays (v2 requires ^4; we're on 4.x).
- **Each Room is exposed as an MCP resource** (`quorus://room/<room_id>`),
  with `resources: { subscribe: true }`. On `appendMessage` the server calls
  `handler.notify.resourceUpdated(uri)`, which reaches every client holding a
  `subscriptions/listen` stream subscribed to that Room.
- **Notifications are a latency hint, not delivery.** The listen stream can
  only carry "Room X changed" pings (four fixed notification types; no
  payloads), and **no client today turns a notification into an agent turn**
  — Claude Code (the only confirmed subscriptions client) refreshes caches
  only. Pull via `get_messages` + `seq` stays the correctness path; ADR
  0006's poll decision is unchanged. No SSE resumability exists in
  2026-07-28, and that costs us nothing precisely *because* truth lives in
  the Store behind the seq cursor.
- **Legacy-client compatibility is a requirement, not an option.** Codex
  defaults to the legacy lifecycle and Cursor has no confirmed 2026-07-28
  support; cross-client is a core product bet. The server must keep
  accepting 2025-era `initialize`/session traffic (SDK version negotiation
  or the `server-legacy` surface) until the major clients negotiate
  2026-07-28 by default. If the SDK cannot serve both revisions on one
  endpoint, we keep a legacy endpoint alive rather than drop old clients.

## Considered options

- **Stay on SDK v1 / revision 2025-11-25:** supported ~6 more months and
  interoperable, but every month deepens the gap, `@hono/mcp` is already
  v1-pinned, and new client capabilities (Claude Code's v2 runtime is the
  default since v2.1.232) target the new revision. Rejected: we'd do the
  same migration later with less headroom.
- **Design delivery around push-waking idle agents:** rejected for the same
  reason as ADR 0006's long-poll rejection — the capability doesn't exist
  portably. Claude's actual wake mechanism (Channels) explicitly cannot run
  on 2026-07-28, so the revisions are currently *mutually exclusive* with
  hands-free wake. We emit the pings so clients that learn to act on them
  get instant benefit; we do not depend on them.

## Consequences

- `src/server/app.ts` and `src/server/tools.ts` are rewritten; the domain
  and store layers are untouched (the Store seam holds). Single-process
  in-memory notification fan-out suffices (single-machine is load-bearing
  per ADR 0004); a shared `ServerEventBus` exists if that ever changes.
- ADR 0004's ephemeral-session caveat becomes moot for 2026-07-28 clients;
  it still applies to legacy-mode clients until compatibility is dropped.
- The codemod covers only surface renames — the architectural move to
  `createMcpHandler` is hand-written, test-first.
