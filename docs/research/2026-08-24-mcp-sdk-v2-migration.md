# MCP SDK v2 / spec 2026-07-28 migration research

**Date:** 2026-08-24
**Scope:** npm state of the v2 SDK packages, v2 server API behind Hono, `subscriptions/listen`
semantics, per-request identity, client support matrix (Claude Code / Cursor / Codex), and the
v1→v2 codemod. Primary sources only; every claim carries its source URL. Version numbers are
copied from npm registry JSON fetched today, not from memory.

---

## 1. npm state

All version numbers and timestamps below are from `https://registry.npmjs.org/@modelcontextprotocol%2f<pkg>`
JSON fetched 2026-08-24.

**v2 is GA, not beta.** Every v2 package's `latest` dist-tag points at plain `2.0.0`, published
2026-07-27 UTC (the night before the spec's 2026-07-28 publication date). The beta line ended at
`2.0.0-beta.5` (2026-07-21).

| Package | dist-tags | Latest version | Published (UTC) |
|---|---|---|---|
| `@modelcontextprotocol/server` | `{"latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:22.239Z |
| `@modelcontextprotocol/client` | `{"latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:22.113Z |
| `@modelcontextprotocol/core` | `{"latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:21.808Z |
| `@modelcontextprotocol/hono` | `{"alpha": "2.0.0-alpha.4", "latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:16.925Z |
| `@modelcontextprotocol/node` | `{"latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:17.622Z |
| `@modelcontextprotocol/codemod` | `{"latest": "2.0.0"}` | 2.0.0 | 2026-07-27T23:55:18.961Z |
| `@modelcontextprotocol/sdk` (v1 line) | `{"latest": "1.30.0"}` | **1.30.0** | 2026-07-27T17:56:01.640Z |

- Prerelease history (all packages, same cadence): `2.0.0-alpha.1/2` on 2026-04-01,
  `alpha.3` 2026-06-25, `alpha.4` 2026-06-30, `beta.1` 2026-06-30, `beta.2` 2026-07-02,
  `beta.3` 2026-07-09, `beta.4` 2026-07-13, `beta.5` 2026-07-21, `2.0.0` 2026-07-27.
  Source: registry JSON `time` fields per package (URLs as above).
- The SDK is published as **nine packages**: `server`, `client`, the four HTTP adapters
  (`node`, `express`, `hono`, `fastify`), `core` (raw Zod wire schemas), plus the migration
  surfaces `server-legacy` and `codemod`. A tenth, `core-internal`, is private/bundled.
  Source: https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages.md
- GA corroboration: "Today, we're officially pushing the release button on the next version of
  the MCP specification, `2026-07-28` … All four Tier 1 SDKs speak `2026-07-28` as of today:
  TypeScript, Python, Go, and C#." (Rust in beta.)
  Source: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- The v1 `@modelcontextprotocol/sdk` line got a final-era release `1.30.0` the same day
  (previous was `1.29.0`, 2026-03-30 — the version Quorus currently pins).
  Source: https://registry.npmjs.org/@modelcontextprotocol%2fsdk

---

## 2. v2 server API: tools + stateless Streamable HTTP behind Hono

Source for everything in this section unless noted:
https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md (docs serve plain markdown at `.md` URLs).

### The official example, verbatim

```ts
import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { Context } from 'hono';
import * as z from 'zod/v4';

const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'notes', version: '1.0.0' });
    server.registerTool('add-note', { description: 'Append a note', inputSchema: z.object({ text: z.string() }) }, async ({ text }) => ({
        content: [{ type: 'text', text: `Saved: ${text}` }]
    }));
    return server;
});

const app = createMcpHonoApp();
app.all('/mcp', (c: Context) => handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));

export default app;
```

### Handler shape / server-per-request model

- "`createMcpHandler` turns a server factory into a web-standard HTTP handler, and
  `handler.fetch` takes the `Request` a Hono route already holds as `c.req.raw` — no Node
  adapter." "The factory runs once per request, so a fresh `McpServer` serves every call."
  Source: https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md
- "`createMcpHandler` builds a fresh server instance from your factory for every HTTP request
  and holds nothing between requests, so a v2 server is stateless and scales horizontally by
  default." Sessions (`Mcp-Session-Id`, sessions `Map`, `NodeStreamableHTTPServerTransport`
  with `sessionIdGenerator`) belong to the "hand-wired 2025-era transport" and are kept only
  for legacy deployments.
  Source: https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.md
- Zod schemas go in the tool config object: `inputSchema: z.object({...})` (a full schema
  object, not a raw shape — the codemod wraps v1 raw shapes with `z.object()`, see §6). The
  official example imports `* as z from 'zod/v4'`. `inputSchema` accepts any Standard Schema
  that can produce JSON Schema (e.g. ArkType).
  Sources: https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md,
  https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries.md
- `createMcpHonoApp()` is "`new Hono()` with JSON body parsing and DNS rebinding protection
  already applied": it parses JSON into `c.get('parsedBody')` and validates `Host`/`Origin`
  against localhost defaults; `createMcpHonoApp({ host: '0.0.0.0', allowedHosts: [...] })`
  for public binds.
  Source: https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md
- Auth forwarding: "`handler.fetch`'s second argument is strictly pass-through, and handlers
  read it as `ctx.http.authInfo`":

  ```ts
  publicApp.all('/mcp', async (c: Context) => {
      const authInfo = await verifyToken(c.req.raw);
      return handler.fetch(c.req.raw, { authInfo, parsedBody: c.get('parsedBody') });
  });
  ```
  Source: https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md
- Server-push after the request: publish through the **handler**, not the per-request server
  instance — `handler.notify.resourceUpdated(uri)` / `notify.toolsChanged()` /
  `notify.promptsChanged()` / `notify.resourcesChanged()` deliver to every open
  `subscriptions/listen` stream that opted in. Multi-process delivery goes through a shared
  `ServerEventBus` (`publish`/`subscribe`, default `InMemoryServerEventBus`):
  `createMcpHandler(buildServer, { bus: redisBus })`.
  Sources: https://ts.sdk.modelcontextprotocol.io/v2/servers/notifications.md,
  https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.md

### Does `@modelcontextprotocol/hono` replace `@hono/mcp`?

- `@modelcontextprotocol/hono` is the **official first-party** Hono adapter, one of the SDK's
  four HTTP adapters: "Four adapters exist: `@modelcontextprotocol/node` for Node's built-in
  `http` server, and one each for Express, Hono, and Fastify. They are thin layers over
  `createMcpHandler` and add no MCP behavior of their own."
  Source: https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages.md
- `@hono/mcp` is the Hono team's third-party middleware (`repository: honojs/middleware`).
  Latest `0.3.2`, published 2026-08-18, **not deprecated**, but its peer dependency pins the v1
  SDK: `"@modelcontextprotocol/sdk": "^1.29.0"`. It has no v2 support and the official v2 docs
  never mention it.
  Source: https://registry.npmjs.org/@hono%2fmcp (dist-tags, `time`, `peerDependencies` of 0.3.2)
- Conclusion: for SDK v2, yes — you drop `@hono/mcp` and use `@modelcontextprotocol/hono`
  (or call `handler.fetch(c.req.raw, …)` from a plain Hono route without the adapter; the
  adapter only adds the pre-parsed body + DNS-rebinding app factory). `@hono/mcp` remains a
  live option only if you stay on SDK 1.x.

---

## 3. `subscriptions/listen` semantics (spec 2026-07-28)

Sources: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
and https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http.

### What it replaces

> "Replace the HTTP GET endpoint and `resources/subscribe`/`resources/unsubscribe` with
> `subscriptions/listen`: a single long-lived POST-response stream for opted-in
> server-to-client change notifications." — changelog, major change 4
> (https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Opening the stream (HTTP mechanics)

An ordinary POST to the MCP endpoint whose response is an SSE stream that stays open:

> "Long-lived notification streams are obtained by sending a `subscriptions/listen` request.
> The server's response is itself an SSE stream that stays open and delivers the change
> notifications the client opted in to (such as `notifications/tools/list_changed` or
> `notifications/resources/updated`). Request-scoped notifications like
> `notifications/progress` and `notifications/message` are **not** delivered on the listen
> stream — they flow only on the response stream of the request they relate to." — transport spec

Request shape (spec example, verbatim):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscriptions/listen",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "ExampleClient", "version": "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    },
    "notifications": {
      "toolsListChanged": true,
      "resourceSubscriptions": ["file:///project/config.json"]
    }
  }
}
```

### What you can subscribe to (the whole filter)

| Field | Type | Delivers |
|---|---|---|
| `toolsListChanged` | boolean | `notifications/tools/list_changed` |
| `promptsListChanged` | boolean | `notifications/prompts/list_changed` |
| `resourcesListChanged` | boolean | `notifications/resources/list_changed` |
| `resourceSubscriptions` | string[] (URIs) | `notifications/resources/updated` for those URIs |

> "The server **MUST NOT** send notification types the client has not explicitly requested."
— subscriptions pattern page. There is no arbitrary-event channel; these four types are it.

### Acknowledgment and publishing

> "The server **MUST** send `notifications/subscriptions/acknowledged` as the first message
> carrying the subscription's ID in `_meta` under `io.modelcontextprotocol/subscriptionId`,
> and **MUST NOT** send any notification on the subscription before it." The acknowledgment's
> `notifications` field "reflects the subset the server agreed to honor."

Notification payload (spec example, verbatim — the subscription ID is the JSON-RPC id of the
originating `subscriptions/listen` request):

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "_meta": { "io.modelcontextprotocol/subscriptionId": 1 },
    "uri": "file:///project/config.json"
  }
}
```

Per-resource updates additionally require the server to advertise
`resources: { subscribe: true }` (SDK gate).
Source: https://ts.sdk.modelcontextprotocol.io/v2/servers/notifications.md

### Auth / identity on the stream

The listen stream is opened by a normal authenticated POST; there is no stream-specific auth
mechanism. The authorization spec's blanket rule applies (see §4): "authorization **MUST** be
included in every HTTP request from client to server."
Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization

### Disconnect / teardown (no resumability)

- > "Remove SSE stream resumability and message redelivery (the `Last-Event-ID` header and SSE
  > event IDs) from the Streamable HTTP transport. A broken response stream loses the in-flight
  > request; clients **MUST** re-issue it as a new request with a new request ID." — changelog,
  > major change 9. Transport spec: "Resumable SSE streams via `Last-Event-ID` are not supported."
- A subscription ends when: the client closes the SSE stream (that close **is** the
  cancellation signal on HTTP); the server tears it down — it "**SHOULD** send a successful
  `subscriptions/listen` response" (a `resultType: "complete"` JSON-RPC response correlated by
  id, carrying the `subscriptionId` in `_meta`) before closing, signalling graceful closure;
  or the transport drops. "A transport that closes without it indicates an unexpected
  disconnect, which the client **MAY** treat as a trigger to reconnect."
- The server holds no subscription state across reconnections; the stdio clause states it
  explicitly: "the client **MUST** re-send `subscriptions/listen` to re-establish its
  subscriptions — the server holds no subscription state across reconnections."
  Source: subscriptions pattern page.
- Keep-alives: "servers are encouraged to periodically emit an SSE comment line (a line
  beginning with a colon, e.g. `:\r\n`)" to survive intermediaries/idle timeouts, and SHOULD
  send `X-Accel-Buffering: no`. Source: transport spec.

### Client-side SDK API (for reference)

`client.listen({ toolsListChanged: true, resourceSubscriptions: ['config://app'] })` resolves
on acknowledgment with an `McpSubscription` (`honoredFilter`, `close()`, `closed` resolving to
`'local' | 'graceful' | 'remote'`). "The SDK never re-listens for you."
Source: https://ts.sdk.modelcontextprotocol.io/v2/clients/subscriptions.md

---

## 4. Per-request identity now that sessions are gone

### Sessions removed; handles as tool arguments

> "Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP
> transport. List endpoints (`tools/list`, `resources/list`, `prompts/list`) no longer vary
> per-connection. **Servers that need cross-call state use explicit, server-minted handles
> passed as ordinary tool arguments** ([SEP-2567])." — changelog, major change 1
> (https://modelcontextprotocol.io/specification/2026-07-28/changelog)

Transport spec on legacy traffic: a 2026-07-28-only server receiving old-style traffic SHOULD
answer GET/DELETE with `405`, and for "an `Mcp-Session-Id` header on a request: ignore it, and
do not mint or echo session IDs."
Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http

### Authorization on every request

From https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization ("Access
Token Usage"):

> "MCP client **MUST** use the Authorization request header field …
> `Authorization: Bearer <access-token>` … **Note that authorization MUST be included in every
> HTTP request from client to server.**"
> "Access tokens **MUST NOT** be included in the URI query string."
> "MCP servers **MUST** validate that access tokens were issued specifically for them as the
> intended audience, according to RFC 8707 Section 2." Invalid/expired tokens → 401;
> insufficient scope → 403 `insufficient_scope` with a `WWW-Authenticate` challenge.

### How a stateful server correlates calls

Two mechanisms, composable:

1. **The Bearer token itself** — every request (including the `subscriptions/listen` POST)
   carries it, and in the v2 SDK the verified identity arrives per-request as
   `ctx.http.authInfo` (and as `ctx.authInfo` in the per-request server factory, which "can
   register a different tool set per caller before any handler runs").
   Source: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.md
2. **Server-minted handles as ordinary tool arguments** (SEP-2567 language above) — e.g. a
   `room_id` or ticket string the server issued from an earlier call, passed back explicitly.
   The related tasks extension likewise "allows servers to return task handles unsolicited"
   (changelog, major change 6).

Additionally, every request self-describes: `_meta` carries
`io.modelcontextprotocol/protocolVersion` and `clientCapabilities`; clients SHOULD send
`clientInfo` on each request (changelog, major change 2). The `initialize` handshake is gone;
`server/discover` is the up-front probe (major change 3).

---

## 5. Client support matrix (as of 2026-08-24)

### Claude Code — CONFIRMED (2026-07-28 + subscriptions/listen)

Source: https://code.claude.com/docs/en/mcp ("MCP client runtimes", "Dynamic tool updates",
"Notification streams on the v2 runtime", "Push messages with channels") and
https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md.

- "Claude Code connects to MCP servers through one of two client runtimes. The v1 runtime is
  built on MCP TypeScript SDK 1.x. The v2 runtime is the same code on MCP TypeScript SDK 2.0,
  which adds MCP protocol revision 2026-07-28." "**On Claude Code v2.1.232 or later, Claude
  Code uses the v2 runtime**" (with carve-outs: Bedrock/GCP/Foundry, apps-gateway logins, and
  feature-flag-off environments stay on v1; `MCP_SDK_GENERATION=v1|v2` overrides).
- Negotiation: on v2 it "Asks HTTP and claude.ai connector servers whether they support the
  newer revision, and uses it with those that do. It asks stdio servers only if you set
  `MCP_PROTOCOL_NEGOTIATION` to `auto`."
- `subscriptions/listen`: on the v2 runtime Claude Code "receives `list_changed` notifications
  from a server on the newer protocol revision over a stream it holds open. When the stream
  closes, Claude Code reopens it," with limits: streams that die within 10s get 3 reopens then
  stop; longer-lived streams (serverless hosts) get 5 reopens per hour, then a ~6-hour wait.
  Changelog corroboration: v2.1.233 "Fixed MCP v2 connections endlessly reopening the
  subscriptions/listen stream against servers that terminate long-held streams on a fixed
  timeout (e.g. serverless hosts)"; v2.1.232 fixed hangs on "the protocol-version probe";
  v2.1.238 fixed stdio servers receiving `server/discover` before `initialize`.
- **Does a notification wake an idle agent? NO.** "When an MCP server sends a `list_changed`
  notification, Claude Code automatically refreshes the available capabilities from that
  server" — it refreshes tool/prompt/resource lists; nothing re-prompts the model. The feature
  that *does* wake a session is **Channels**, a Claude-specific capability outside core MCP:
  "An MCP server can also push messages directly into your session so Claude can react to
  external events … your server declares the `claude/channel` capability and you opt it in
  with the `--channels` flag." And critically, **channels do not work on 2026-07-28**: "if …
  a channel server negotiates MCP protocol revision 2026-07-28, it can't deliver channel
  messages, so Claude Code doesn't register it as a channel" — i.e. Claude Code "Doesn't
  register a channel server that connects on the newer revision, because that revision can't
  carry channel messages."
- Anthropic's product-level statement is only: "Support is being rolled out across Claude
  products soon." Source: https://claude.com/blog/bringing-mcp-2026-07-28-to-claude

### OpenAI Codex — CONFIRMED (2026-07-28, opt-in, legacy default); subscriptions NOT found

Sources: https://github.com/openai/codex/pull/35724 (merged 2026-07-28T05:54Z) and
https://github.com/openai/codex/pull/35725 (merged 2026-07-28T06:09Z).

- PR #35724 "Add MCP 2026-07-28 discovery support": "Add an opt-in `mcp_2026_07_28` protocol
  mode **while preserving the legacy lifecycle by default**. Negotiate the new protocol over
  streamable HTTP with `server/discover` … fallback only when a response establishes that the
  endpoint is legacy-only. Require stdio servers to opt in with
  `CODEX_MCP_PROTOCOL_VERSION=2026-07-28`." Plus paginated tool/resource catalogs in modern mode.
- PR #35725 "Complete MCP 2026 client support": "Drive multi-round `tools/call` and
  `resources/read` requests through `input_required` responses" (MRTR), modern
  discovery/elicitation shapes, 8 MiB modern-protocol response limit.
- Neither PR, nor the Codex MCP docs (https://developers.openai.com/codex/mcp →
  https://learn.chatgpt.com/docs/extend/mcp — documents stdio + Streamable HTTP with bearer
  token/OAuth, no protocol-revision detail), mentions `subscriptions/listen`. **Could not
  confirm** Codex subscription support, and nothing found about notifications waking an agent.

### Cursor — could NOT confirm 2026-07-28 support

- Cursor's MCP docs (https://docs.cursor.com/en/context/mcp → https://cursor.com/docs/context/mcp)
  list transports "stdio, SSE, Streamable HTTP" and protocol features "Tools, Prompts,
  Resources, Roots, Elicitation, Apps (extension)" with **no protocol revision stated** and no
  mention of subscriptions or notifications.
- Cursor's changelog (https://cursor.com/changelog, entries 2026-07-29 → 2026-08-19 reviewed)
  contains no MCP-protocol entries. **Could not confirm** any 2026-07-28 or
  `subscriptions/listen` support in Cursor.

### The delivery-semantics bottom line

For no client could I confirm that a received `subscriptions/listen` notification wakes or
re-prompts an idle agent. The one confirmed wake mechanism (Claude Code Channels) is a
proprietary capability that explicitly does not ride the 2026-07-28 revision. On 2026-07-28,
notifications trigger cache refreshes (list refetch / resource re-read) in the transport layer
of the client, not agent turns.

---

## 6. Codemod: `npx @modelcontextprotocol/codemod v1-to-v2`

Source: package README from https://registry.npmjs.org/@modelcontextprotocol%2fcodemod
(version 2.0.0; `repository: github.com/modelcontextprotocol/typescript-sdk` — it lives in the
SDK monorepo; a standalone `modelcontextprotocol/codemod` repo 404s). Bin name: `mcp-codemod`.
Usage: `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` — rewrites
`.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs` **in place**; run on a clean tree.

### What it transforms (README, condensed)

- **Import paths**: `@modelcontextprotocol/sdk/...` deep paths → the v2 packages (`importMap.ts`).
- **Symbol renames**: `McpError` → `ProtocolError`, `StreamableHTTPError` → `SdkHttpError`,
  `IsomorphicHeaders` → `Headers`, `SchemaInput<T>` → `StandardSchemaWithJSON.InferInput<T>` (`symbolMap.ts`).
- **`setRequestHandler(Schema, …)` → `setRequestHandler('method/string', …)`** (`schemaToMethodMap.ts`).
- **Handler context**: `extra.*` → `ctx.mcpReq.*` / `ctx.http?.*` (`contextPropertyMap.ts`).
- **`.tool()` → `registerTool`**, wrapping raw `inputSchema`/`outputSchema`/`argsSchema`/`uriSchema`
  shapes with `z.object()` and adding `import { z } from 'zod'` where needed.
- Drops the result-schema argument from `client.request()`/`client.callTool()` for spec methods;
  routes spec `*Schema` imports to `@modelcontextprotocol/core`; routes
  `ErrorCode.{RequestTimeout,ConnectionClosed}` to `SdkErrorCode` (adjusting `instanceof` guards);
  rewrites `vi.mock`/`jest.mock`/dynamic `import()` paths; inverts optional completable nesting
  (`completable(schema.optional(), cb)` → `completable(schema, cb).optional()`); moves
  `Protocol`/`mergeCapabilities` imports from `shared/protocol.js` to the package roots.
- Where it recognizes a v1 pattern it can't safely rewrite, it inserts
  `/* @mcp-codemod-error … */` comments — sweep with `grep -rn '@mcp-codemod-error' .`.

### What it does NOT cover (README, verbatim list)

> "CJS→ESM / Node 20 pre-flight, header **read** rewrites (`ctx.http?.req?.headers` bracket
> access → `.get()` …), OAuth error-class consolidation (`instanceof InvalidGrantError` →
> `OAuthError` + `OAuthErrorCode`), per-scenario `SdkErrorCode` branch selection,
> `ctx.mcpReq.send()` schema-arg drop, and behavioral adaptation are manual."

And the architectural boundary:

> "The codemod handles the v1→v2 SDK surface upgrade only. Adopting the 2026-07-28 protocol
> revision (`createMcpHandler`, multi-round-trip requests, `versionNegotiation`) is
> architectural and not codemod-automatable."

Post-codemod guides: https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2 and
https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.

---

## Could not confirm

- **Cursor** support for protocol revision 2026-07-28, `subscriptions/listen`, or any MCP v2
  behavior — nothing in official docs or the current changelog window.
- **Codex** support for `subscriptions/listen` (its 2026-07-28 PRs cover discovery, MRTR,
  pagination, limits — no subscriptions).
- Any client in which a received notification **wakes/re-prompts an idle agent** (vs.
  refreshing transport-level caches). Claude Code Channels wake a session but are not
  `subscriptions/listen` and explicitly cannot run on the 2026-07-28 revision.
- Which Claude products beyond Claude Code have shipped 2026-07-28 (the Anthropic blog says
  only "rolling out … soon"; Claude Code's docs/changelog are the concrete evidence).
- Exact Claude Code version that first *introduced* (vs. defaulted) the v2 runtime — the docs
  state the default flipped at v2.1.232; no earlier "added v2 runtime" changelog entry found.

---

## Implications for Quorus

**Identity per-request via the existing Bearer token — direct fit.** Quorus already binds
identity via an auth layer on `/mcp`; in v2 that becomes the canonical pattern: the Hono route
verifies the token and passes `handler.fetch(c.req.raw, { authInfo, parsedBody })`; tools read
`ctx.http.authInfo`, and the per-request factory gets `ctx.authInfo` early enough to register
a per-Member tool set. The spec requires the token on *every* request anyway. Our Member Token
concept also maps cleanly onto SEP-2567's "server-minted handles passed as ordinary tool
arguments" for anything the token doesn't carry (e.g. `room_id`).

**Sessions Map removal.** "Identity bound per connection" (current `src/server/tools.ts`
model) has no v2 equivalent — there is no connection. `createMcpHandler` constructs a fresh
`McpServer` per request from a factory; all cross-call state must live in the Store (already
our persistence seam) keyed by token-derived Member identity + explicit handles. The v1-style
transport-per-session `Map` and `Mcp-Session-Id` plumbing disappear entirely (kept in the SDK
only for 2025-era clients via `NodeStreamableHTTPServerTransport` + `server-legacy`). Also:
swap `@hono/mcp` (pinned to SDK ^1.29.0) for `@modelcontextprotocol/hono`, and note the
codemod won't do this architectural part — only the surface renames.

**Delivery upgrade feasibility — partial.** The v2 plumbing is genuinely good for us
server-side: `handler.notify.resourceUpdated(uri)` + `ServerEventBus` gives a clean seam for
pushing "Room changed" events (model each Room as a resource URI, advertise
`resources: { subscribe: true }`; single-process needs no bus, multi-node needs a shared bus).
But two hard limits temper it: (1) `subscriptions/listen` carries only the four fixed
notification types — a resource-updated ping with a URI, not message payloads; clients must
call back (`resources/read` or a `messages_pull` tool) to fetch content; (2) no confirmed
client turns a notification into an agent turn — Claude Code (the one confirmed
subscriptions/listen client) only refreshes caches, and its wake mechanism (Channels) can't
ride 2026-07-28. So: adopt notifications as a cache-invalidation/latency hint, keep pull-based
message delivery (seq cursor) as the correctness path, and don't design around push-waking
idle agents yet. No SSE resumability means a dropped listen stream loses nothing for us as
long as delivery truth stays in the Store and the seq cursor.
