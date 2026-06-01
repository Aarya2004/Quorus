# Design: Dockerfile + Fly.io deploy path

Date: 2026-05-31
Status: approved (brainstorming → spec)
Branch: `claude/continuation-LXpY5`

## Goal

Make Quorus reachable from two machines so Aarya + Arav can dogfood cross-machine
coordination. This is CONTEXT.md priority #1 ("cheapest cross-machine path") and the single
infrastructure blocker on the whole positioning-validation loop. Without a reachable host,
the product cannot leave one laptop and there is nothing to dogfood.

## Scope

**Deploy only.** This PR produces a container and a Fly config that runs the existing server
on one always-reachable (scale-to-zero) host with a persistent SQLite volume.

Explicitly **out of scope** (each a separate follow-up):

- Auth (shared bearer token) — but see the hard gate below.
- Human-view dashboard.
- `wait`/long-poll mode on `get_messages`.
- A packaged connect CLI (documented snippet only, for now).
- Retention/eviction logic.
- Durable MCP sessions.

## Locked decisions (from grilling)

### 1. Build: multi-stage, Bun-install + esbuild-bundle, Node-run

- **Build stage** (`oven/bun` base): `bun install --frozen-lockfile`, then bundle:
  `esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/index.js`.
- **Runtime stage** (`node:24-slim` base): `bun install --production` (pure-JS runtime deps
  only — no vitest/biome/vite chain), `COPY` the bundled `dist/`, run `node dist/index.js`.
- **Never `COPY` host `node_modules`.** The repo's `node_modules` contains darwin-arm64
  native binaries (`fsevents`, `lightningcss-darwin-arm64`, `@rolldown/binding-darwin-arm64`)
  that are dev/website-only and would be wrong-arch in a Linux container. Installing fresh
  inside Linux stages avoids this entirely; `.dockerignore` also excludes `node_modules`.
- `node:sqlite` stays **external** to the bundle (it is a Node built-in; the bundler must not
  attempt to inline it). `--packages=external` keeps all imports external, resolved at runtime.
- esbuild preserves import order, so the `suppress-warnings` load-order hack
  (`src/store/sqlite-store.ts:1` imports `../suppress-warnings` before `node:sqlite`) survives.

Rationale: a build step yields the leanest runtime image (a single JS file + a handful of
pure-JS deps, no tsx/vitest/biome/native-binary chain). esbuild over `tsc` because the
project's `tsconfig.json` is typecheck-only (`noEmit: true`, `moduleResolution: "Bundler"`)
and switching `tsc` to emit runnable ESM reintroduces the NodeNext/extension friction that
`tsx` was originally chosen to avoid. esbuild sidesteps all of it.

### 2. Auth is a hard gate before real dogfood — not this PR

The deploy ships **un-gated**: `x-quorus-member` is pure self-assertion, so anyone who knows
the URL can post as any Member. This is acceptable only for throwaway smoke tests.

The shared-bearer-token PR **must land before the first real cross-machine coordination
session.** Member attribution ("who said what") is the core of the orchestrator-tier
positioning bet; unauthenticated identity makes dogfood data untrustworthy. The deploy doc
and CONTEXT.md Next Up will state this as non-negotiable, not an optional follow-up.

### 3. Scale to zero, accept session reconnect

- `min_machines_running = 0`, Fly auto-stop on. Cheapest possible dogfood host (near-zero
  cost when idle).
- The MCP `sessions` Map in `src/server/app.ts` is in-memory, so a cold start wipes it: a
  request carrying a stale `mcp-session-id` gets `404 "unknown session"`. This is **expected,
  not a bug** — well-behaved MCP clients clear and re-`initialize`, identity is re-supplied
  via `x-quorus-member` on the new connection, and all data is durable on the SQLite volume.
  Sessions are nearly stateless (just the bound member name), so the reconnect is cheap.
- Captured in **ADR 0004**, with an explicit note to revisit (durable sessions or always-warm
  machine) **before public/alpha hosting.**

### 4. Retention bounded by volume size, documented

- 3 GB Fly volume — far exceeds any 2-week dogfood (millions of text messages).
- No eviction logic. The glossary's "indefinite" Retention is, in deployment reality,
  "indefinite until the volume fills." CONTEXT.md's Retention term has been amended to say so;
  `docs/deploy.md` notes the bound.

## Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | Two-stage: Bun-install + esbuild-bundle → `node:24-slim` runtime running `node dist/index.js`. |
| `.dockerignore` | Exclude `node_modules`, `data/`, `.git`, `website/`, `*.test.ts`, `docs/`, `dist/`. |
| `fly.toml` | `internal_port = 8787`, `force_https`; `[[http_service.checks]]` → `GET /health`; `[mounts] quorus_data → /data`; `[env] QUORUS_DB_PATH = "/data/quorus.db"`; `min_machines_running = 0`; comments explaining scale-to-zero/reconnect + auth gate. |
| `docs/deploy.md` | Runbook + connect snippet + expected-404 note + retention bound + auth gate. |
| `docs/adr/0004-scale-to-zero-ephemeral-sessions.md` | ADR recording the scale-to-zero / ephemeral-session trade-off; revisit-before-alpha note. |
| `package.json` | Add `esbuild` devDep + a `build` script. (Only `src/`-adjacent change.) |

## No `src/` changes

`src/index.ts` already reads `QUORUS_DB_PATH` / `PORT` and `mkdirSync`s the data dir
(`src/index.ts:8-12`). The container only needs to set those env vars and mount the volume.

## Data flow (runtime, unchanged)

Container starts → `node dist/index.js` → reads `QUORUS_DB_PATH=/data/quorus.db` →
`mkdirSync` ensures `/data` exists → `SqliteStore` opens on the Fly volume (a local block
device — WAL mode is safe; it would not be on a network FS, which is another reason
single-machine is load-bearing) → Hono serves `/mcp` + `/health` on `:8787`. Fly's edge
terminates TLS on 443 and runs the `GET /health` check.

## Verification (definition of done)

- `docker build` succeeds.
- `docker run -e PORT=8787 -p 8787:8787 -v $(pwd)/data:/data <img>` boots and
  `curl localhost:8787/health` → `{"ok":true}`. **This proves the compiled
  `node dist/index.js` actually runs** — the real risk in switching off tsx.
- `npm test` (36 tests), `npm run typecheck`, `npm run lint` all green.
- `fly deploy` is the user's to run (needs their Fly auth); the doc provides exact commands:
  `fly launch --no-deploy`, `fly volume create quorus_data --size 3`, `fly deploy`.

## Known risks

- **Compiled output must boot** — mitigated by the docker-run + curl check above being part
  of done, not an afterthought.
- **Un-gated window** — mitigated by the auth hard gate (decision 2): no real dogfood until
  the token lands.
- **404 after idle** — by design (decision 3); documented so it is not mistaken for a bug.

## Commit breakdown

1. `chore: add esbuild build step`
2. `feat: containerize server`
3. `feat: fly.io deploy config`
4. `docs: deploy runbook and ADR 0004`

(CONTEXT.md update folds into the docs commit.)
