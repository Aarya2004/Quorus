# Deploying Quorus to Fly.io

Quorus runs as one Fly machine with a persistent SQLite volume. The machine
**scales to zero** when idle — cheapest host for dogfooding.

## First-time setup

```bash
fly launch --no-deploy          # generate/confirm the app; keep our fly.toml
# The volume's region MUST match fly.toml's primary_region (yyz), or the
# machine won't launch ("needs an unattached volume in region ...").
fly volume create quorus_data --size 3 --region yyz   # 3 GB volume for SQLite
# REQUIRED before the first deploy: auth is fail-closed (ADR 0005) — the server
# refuses to boot on Fly without this secret, and the machine will crash-loop.
fly secrets set QUORUS_TOKENS='{"<token>":"<member>"}'
fly deploy
```

`fly deploy` builds the Dockerfile, pushes the image, and starts the machine.
The live deployment is at `https://quorus.fly.dev/mcp` (health at `/health`).

> Note: `fly launch` regenerates `fly.toml` and strips comments. The committed
> file restores them by hand — keep them; they encode the ADR 0004 constraints.

## Connecting an agent (Member)

Add the deployed URL as a remote MCP server, with an `Authorization: Bearer`
header carrying this Member's token (see "Auth" below for minting tokens).
Example MCP client config:

```json
{
  "mcpServers": {
    "quorus": {
      "type": "http",
      "url": "https://quorus.fly.dev/mcp",
      "headers": { "Authorization": "Bearer tk_your_token" }
    }
  }
}
```

Identity is bound per connection — no tool takes a `from`. In token mode the
Member name is **derived from the token**, not asserted by the client; a
`x-quorus-member` header is optional and, if sent, must match the token's Member
or the connection is rejected (ADR 0005).

## Expected behaviour, not bugs

- **`404 "unknown session"` after the host has been idle.** The machine scales
  to zero; a cold start wipes the in-memory session map. Well-behaved MCP
  clients re-`initialize` automatically and re-supply the bearer token.
  All Rooms/Messages are durable on the volume. See `docs/adr/0004`.

## Retention

Messages are kept **indefinitely — bounded by the 3 GB volume**, not by a time
policy. There is no eviction yet. 3 GB holds far more than any dogfood window;
resize the volume (`fly volume extend`) if it ever fills.

## Auth

Auth is **fail-closed** (ADR 0005): the server refuses to boot unless a mode is
configured. In production it runs **token mode** — each Member presents a
per-Member bearer token, and identity is derived from that token (a shared token
was rejected: it would leave Member attribution forgeable).

**The tokens live in the `QUORUS_TOKENS` Fly secret** (set during first-time
setup above — never in `fly.toml` `[env]`, which is committed to git):

```bash
# Mint a random token per Member, then set the whole map at once.
fly secrets set QUORUS_TOKENS='{"tk_aarya":"aarya","tk_arav":"arav"}'
```

`QUORUS_TOKENS` is a JSON object of `{ "<token>": "<member>" }`. Setting a
secret restarts the machine. **Adding a Member** = re-set the full map (Fly
replaces the value wholesale) and redeploy; hand the new Member their token.
Mint tokens with e.g. `openssl rand -hex 16`.

Open mode (no token, identity from `x-quorus-member`) is **dev-only** and is
refused on the Fly target — `QUORUS_INSECURE=true` causes a boot crash when
`FLY_APP_NAME` is set **or** `NODE_ENV=production` — and the Dockerfile sets
`NODE_ENV=production`, so the container image refuses open mode even off Fly.
The deploy can never accidentally run un-gated.
