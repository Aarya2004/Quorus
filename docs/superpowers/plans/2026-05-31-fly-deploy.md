# Fly.io Deploy Path Implementation Plan

> **COMPLETED 2026-05-31** — all tasks shipped in commits f6b7a47..957aa94.
> Historical record; checkboxes left unticked. Corrections since: region
> iad→yyz (39136db); the inline copies of `deploy.md` and ADR 0004 below are
> point-in-time snapshots — see the committed files, and note the auth approach
> here was superseded by ADR 0005.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize the Quorus server and add Fly.io config so two machines can join the same Room over a public URL, unblocking cross-machine dogfooding.

**Architecture:** Multi-stage Docker build — `oven/bun` stage installs deps and bundles `src/index.ts` to a single `dist/index.js` with esbuild; `node:24-slim` runtime stage installs production deps and runs `node dist/index.js`. Fly runs one scale-to-zero machine with a 3 GB persistent volume mounted at `/data` for the SQLite file. No `src/` code changes — `src/index.ts` already reads `QUORUS_DB_PATH`/`PORT`.

**Tech Stack:** Docker (multi-stage), Bun 1.3.10 (install), esbuild (bundle), Node 24 (runtime), Fly.io (host + volume), Hono server (existing).

Spec: `docs/superpowers/specs/2026-05-31-fly-deploy-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | Add `esbuild` devDep + `build` script (the only repo-config change). |
| `Dockerfile` | Two-stage build → runnable image. |
| `.dockerignore` | Keep build context small; never ship host `node_modules`/`data`. |
| `fly.toml` | Fly service: port, health check, volume mount, env, scale-to-zero. |
| `docs/deploy.md` | Runbook + connect snippet + expected-404 note + auth gate. |
| `docs/adr/0004-scale-to-zero-ephemeral-sessions.md` | Records the scale-to-zero / ephemeral-session trade-off; revisit-before-alpha. |
| `CONTEXT.md` | Recent Changes + Next Up + Key Decisions updates. |

This plan has **no automated unit tests** (it produces infra config, not application code). Verification is a real `docker build` + `docker run` + `curl /health`, performed in Task 2 and re-confirmed in Task 3. That build-and-boot check is the regression guard for the tsx→esbuild switch.

---

### Task 1: Add the esbuild build step

**Files:**
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Add esbuild as a dev dependency**

Run:

```bash
bun add -d esbuild
```

Expected: `esbuild` appears under `devDependencies` in `package.json` and `bun.lock` updates.

- [ ] **Step 2: Add a `build` script**

In `package.json`, add this line to the `scripts` object (after `start`):

```json
"build": "esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/index.js",
```

Rationale for each flag:
- `--bundle` — follow local imports into one file.
- `--platform=node` — Node globals/resolution, not browser.
- `--format=esm` — the project is `"type": "module"`.
- `--packages=external` — leave `node_modules` imports (and the `node:sqlite` built-in) unbundled, resolved at runtime. Critical: bundling `node:sqlite` would break it.
- `--outfile=dist/index.js` — single output the runtime stage runs.

- [ ] **Step 3: Run the build and verify output exists**

Run:

```bash
npm run build && node -e "require('fs').statSync('dist/index.js'); console.log('dist/index.js OK')"
```

Expected: `dist/index.js OK` (no esbuild errors).

- [ ] **Step 4: Verify the bundle boots locally**

Run (uses a temp DB dir so it does not touch `./data`):

```bash
QUORUS_DB_PATH=/tmp/quorus-build-check.db PORT=8799 node dist/index.js &
SERVER_PID=$!
sleep 1
curl -s localhost:8799/health
kill $SERVER_PID
rm -f /tmp/quorus-build-check.db /tmp/quorus-build-check.db-wal /tmp/quorus-build-check.db-shm
```

Expected: `{"ok":true,"service":"quorus"}`. This proves esbuild output runs under plain `node` (the core tsx→esbuild risk) before we wrap it in Docker.

- [ ] **Step 5: Confirm existing checks stay green**

Run:

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, lint clean, 36 tests pass. (Adding a devDep + script must not regress anything.)

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add esbuild build step"
```

(`dist/` is build output — it must NOT be committed; Task 2 adds it to `.dockerignore`/`.gitignore`.)

---

### Task 2: Containerize the server

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `.gitignore` (add `dist/`)

- [ ] **Step 1: Add `dist/` to `.gitignore`**

Append to `.gitignore` (create the file if it does not exist):

```
dist/
```

- [ ] **Step 2: Write `.dockerignore`**

Create `.dockerignore` with:

```
node_modules
dist
data
.git
.gitignore
website
docs
*.test.ts
**/*.test.ts
.nvmrc
biome.json
README.md
CONTEXT.md
CLAUDE.md
```

Why: keeps the build context small and — critically — never copies the host's `node_modules` (which holds darwin-arm64 native binaries for `fsevents`/`lightningcss`/`rolldown` that are wrong-arch in Linux and dev/website-only anyway). Deps are installed fresh inside the image.

- [ ] **Step 3: Write the `Dockerfile`**

Create `Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1

# --- build stage: install deps with Bun, bundle with esbuild ---
FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# --- runtime stage: Node 24 running the bundle ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV QUORUS_DB_PATH=/data/quorus.db
# Production deps only — bundle keeps imports external, so runtime needs them.
COPY package.json bun.lock ./
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/index.js"]
```

Notes:
- The bundle is `--packages=external`, so the runtime stage installs production deps (`hono`, `@hono/*`, `@modelcontextprotocol/sdk`, `zod`) — pure JS, no native binaries.
- We copy the `bun` binary from the build stage rather than switching base images, so the runtime install uses the same frozen lockfile.
- `node:sqlite` is a Node 24 built-in — no install needed; `NODE_ENV=production` is set for downstream libs.

- [ ] **Step 4: Build the image**

Run:

```bash
docker build -t quorus:deploy-test .
```

Expected: build completes through both stages with no error. If `bun install --production` errors on a missing runtime dep, that dep was mis-scoped as a devDep — fix `package.json` and rebuild.

- [ ] **Step 5: Run the container and verify `/health`**

Run:

```bash
mkdir -p /tmp/quorus-docker-data
docker run -d --name quorus-check -p 8788:8787 \
  -v /tmp/quorus-docker-data:/data quorus:deploy-test
sleep 2
curl -s localhost:8788/health
docker logs quorus-check
docker rm -f quorus-check
rm -rf /tmp/quorus-docker-data
```

Expected: `curl` returns `{"ok":true,"service":"quorus"}`, and `docker logs` shows a `server.start` line with `db: /data/quorus.db`. **This is the definition-of-done check for containerization** — the compiled server boots in the real runtime image and serves traffic.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore .gitignore
git commit -m "feat: containerize server"
```

---

### Task 3: Fly.io deploy config

**Files:**
- Create: `fly.toml`

- [ ] **Step 1: Write `fly.toml`**

Create `fly.toml` with (replace the app name at deploy time — Fly assigns it via `fly launch`):

```toml
# Quorus — single scale-to-zero machine + persistent SQLite volume.
# See docs/adr/0004 for the scale-to-zero / ephemeral-session trade-off.
app = "quorus"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8787"
  QUORUS_DB_PATH = "/data/quorus.db"

# SQLite lives on a persistent volume. WAL mode is safe on this local
# block device; it would NOT be on a network FS — another reason this
# deploy MUST stay single-machine.
[mounts]
  source = "quorus_data"
  destination = "/data"

[http_service]
  internal_port = 8787
  force_https = true
  # Scale to zero when idle (cheapest dogfood host). A cold start wipes the
  # in-memory MCP sessions Map, so a `404 unknown session` after idle is
  # EXPECTED — clients re-initialize. Do not "fix" this by removing it; see
  # ADR 0004. Revisit (durable sessions / always-warm) before public/alpha.
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    method = "GET"
    path = "/health"
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

- [ ] **Step 2: Validate the TOML parses**

Run:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('fly.toml','utf8');if(!/internal_port = 8787/.test(t)||!/destination = \"\/data\"/.test(t))throw new Error('fly.toml missing expected keys');console.log('fly.toml keys OK')"
```

Expected: `fly.toml keys OK`. (A lightweight guard — `fly` CLI auth is not available in this session; full validation happens when the user runs `fly deploy`.)

- [ ] **Step 3: Commit**

```bash
git add fly.toml
git commit -m "feat: fly.io deploy config"
```

---

### Task 4: Deploy runbook, ADR 0004, and CONTEXT update

**Files:**
- Create: `docs/deploy.md`
- Create: `docs/adr/0004-scale-to-zero-ephemeral-sessions.md`
- Modify: `CONTEXT.md`

- [ ] **Step 1: Write `docs/deploy.md`**

Create `docs/deploy.md` with:

````markdown
# Deploying Quorus to Fly.io

Quorus runs as one Fly machine with a persistent SQLite volume. The machine
**scales to zero** when idle — cheapest host for dogfooding.

## First-time setup

```bash
fly launch --no-deploy          # generate/confirm the app; keep our fly.toml
fly volume create quorus_data --size 3   # 3 GB persistent volume for SQLite
fly deploy
```

`fly deploy` builds the Dockerfile, pushes the image, and starts the machine.
After it succeeds, the server is at `https://<app>.fly.dev/mcp` (health at
`/health`).

## Connecting an agent (Member)

Add the deployed URL as a remote MCP server, with an `x-quorus-member` header
carrying this Member's name. Example MCP client config:

```json
{
  "mcpServers": {
    "quorus": {
      "type": "http",
      "url": "https://<app>.fly.dev/mcp",
      "headers": { "x-quorus-member": "Aarya" }
    }
  }
}
```

Identity is bound per connection — no tool takes a `from`. The member name is
whatever you put in the header (see the auth gate below).

## Expected behaviour, not bugs

- **`404 "unknown session"` after the host has been idle.** The machine scales
  to zero; a cold start wipes the in-memory session map. Well-behaved MCP
  clients re-`initialize` automatically and re-supply identity via the header.
  All Rooms/Messages are durable on the volume. See `docs/adr/0004`.

## Retention

Messages are kept **indefinitely — bounded by the 3 GB volume**, not by a time
policy. There is no eviction yet. 3 GB holds far more than any dogfood window;
resize the volume (`fly volume extend`) if it ever fills.

## ⚠️ Auth gate — do this before real dogfooding

This deploy is **un-gated**: `x-quorus-member` is pure self-assertion, so anyone
who knows the URL can post as any Member. That is fine for throwaway smoke
tests, but Member attribution is the core of the product bet. **Add shared
bearer-token auth on `/mcp` before the first real cross-machine coordination
session, and do not trust identity in any usage before that.**
````

- [ ] **Step 2: Write ADR 0004**

Create `docs/adr/0004-scale-to-zero-ephemeral-sessions.md` with:

```markdown
---
status: accepted
---

# Scale-to-zero host with ephemeral MCP sessions

The Fly deploy runs **one machine that scales to zero** when idle
(`min_machines_running = 0`, `auto_stop_machines = "stop"`). The MCP session map
in `src/server/app.ts` is **in-memory**, so a cold start drops all live
sessions: a request carrying a stale `mcp-session-id` receives
`404 "unknown session"`.

## Decision

Accept ephemeral sessions for the dogfooding phase. The cost is occasional
reconnect noise; the benefit is a near-free host.

This is viable because Quorus sessions are **nearly stateless** — a session
holds only the Member name bound from the `x-quorus-member` header. On a 404 a
client re-`initialize`s, re-supplies the header, and continues; all Rooms,
Membership, and Messages are durable on the SQLite volume. Identity survives the
reconnect.

## Considered options

- **Always-warm (`min_machines_running = 1`, no auto-stop)** — no cold-start
  404s, but pays for an idle machine 24/7. Rejected as premature for a two-user
  dogfood where reconnects are tolerable.
- **`auto_stop_machines = "suspend"`** — Fly snapshots/restores memory, which
  *might* preserve the session map. Untested for this app; not relied on.
- **Durable sessions (persist the map to the store / make tools fully
  stateless)** — the real fix, but server-core work out of scope for a deploy.

## Consequences

- A `404 "unknown session"` after idle is **expected, not a bug** — documented
  in `docs/deploy.md`.
- Clients with poor reconnect behaviour (e.g. a naive `/loop` poller) may drop a
  single poll cycle after a cold start.
- **Revisit before public/alpha hosting.** Under real load, scale-to-zero +
  ephemeral sessions stops being acceptable; move to durable sessions or an
  always-warm machine, and pair it with the auth gate (also a pre-alpha task).
```

- [ ] **Step 3: Update CONTEXT.md — Recent Changes**

In `CONTEXT.md`, add this row to the top of the Recent Changes table (below the header row), and drop the oldest row to keep the last 10:

```markdown
| 2026-05-31 | feat: containerize + Fly deploy (scale-to-zero, 3GB volume); ADR 0004 |
```

- [ ] **Step 4: Update CONTEXT.md — In Progress**

In the "In Progress" section, change priority 1 ("Cheapest cross-machine path") to mark the deploy artifacts done and the remaining step as running `fly deploy` + landing auth:

Replace the priority-1 bullet with:

```markdown
1. **Cheapest cross-machine path** — Dockerfile + `fly.toml` + `docs/deploy.md`
   DONE. Remaining: run `fly deploy` (needs Fly auth) and **land shared-token
   auth before any real dogfood** (un-gated host is smoke-test only — ADR 0004
   / deploy.md auth gate).
```

- [ ] **Step 5: Update CONTEXT.md — Key Decisions**

Add these two bullets to the Key Decisions list:

```markdown
- **Deploy host**: one Fly machine, **scale-to-zero**, 3 GB volume for SQLite;
  MCP sessions are ephemeral (cold start drops them) — a 404 after idle is
  expected (ADR 0004). Single-machine is load-bearing (WAL + in-memory sessions).
- **Auth gate**: the deploy ships un-gated; shared-token auth is a **hard
  prerequisite before real dogfooding**, not an optional follow-up.
```

- [ ] **Step 6: Verify docs are internally consistent**

Run:

```bash
grep -l "ADR 0004\|0004" docs/deploy.md docs/adr/0004-scale-to-zero-ephemeral-sessions.md CONTEXT.md
node -e "require('fs').statSync('docs/adr/0004-scale-to-zero-ephemeral-sessions.md');console.log('ADR 0004 present')"
```

Expected: the grep lists at least `docs/deploy.md` and `CONTEXT.md`, and `ADR 0004 present`.

- [ ] **Step 7: Commit**

```bash
git add docs/deploy.md docs/adr/0004-scale-to-zero-ephemeral-sessions.md CONTEXT.md
git commit -m "docs: deploy runbook and ADR 0004"
```

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npm run lint && npm test` — all green (no `src/` changes, so this is a regression check).
- [ ] `docker build -t quorus:final . && docker run -d --name quorus-final -p 8788:8787 -v /tmp/qf:/data quorus:final && sleep 2 && curl -s localhost:8788/health && docker rm -f quorus-final && rm -rf /tmp/qf` — prints `{"ok":true,"service":"quorus"}`.
- [ ] `git log --oneline -4` shows the four commits: esbuild, containerize, fly config, docs.
- [ ] Confirm `dist/` is NOT tracked: `git status --porcelain dist/` prints nothing and `git ls-files dist/` is empty.

`fly deploy` itself is the user's to run (needs their Fly auth).
