# CLAUDE.md — Quorus

## Shared Context Protocol

**Read `CONTEXT.md` at the start of every session.** It contains the current project state, what's in progress, recent changes, architectural decisions, and next priorities. It is the shared memory between all contributors' Claude instances.

**Update `CONTEXT.md` after every significant change:**

- Add your changes to "Recent Changes" (keep last 10, drop oldest)
- Update "In Progress" when starting/finishing work
- Update "Current State" if the system's capabilities changed
- Add to "Key Decisions" when architectural choices are made
- Update "In Progress" when priorities shift

---

## Project

Quorus — coordination layer for AI agent swarms. Shared Rooms agents join over MCP to
exchange messages. (Advisory locks deferred — ADR 0003.)

> **Rebuild in progress.** The Python v1 was wiped on 2026-05-28 and is being rebuilt in
> TypeScript from first principles. See `CONTEXT.md` for current state and iteration plan.

**Stack:** TypeScript / Node ≥22.13 (24 LTS; `node:sqlite` needs it),
`@modelcontextprotocol/sdk` (Streamable HTTP), Hono + `@hono/mcp`, zod, `node:sqlite`,
Vitest, Biome, esbuild (build), tsx (dev runtime). Package manager: **Bun**
(`bun install`); runtime stays Node.

**Run tests:** `npm test`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`
**Lint fix:** `npm run lint:fix`
**Build:** `npm run build` (esbuild bundle, used by the Dockerfile)
**Dev server:** `npm run dev` (serves `/mcp` + `/health` on `:8787`)

---

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)
   └─ MCP client ──Streamable HTTP──▶ Quorus server (one service: /mcp + Store)
```

- `src/server/app.ts` — Hono app: `/mcp` (Streamable HTTP) + `/health`.
- `src/server/tools.ts` — MCP server with the 5 tools; identity bound per connection.
- `src/store/` — `Store` interface + SQLite (default) and JSONL implementations (the persistence seam).
- `src/domain/types.ts` — Room, Member, Message, Seq, errors, limits.
- `src/config.ts` — fail-closed auth config loader (ADR 0005).
- `src/log.ts` — structured logger.
- The relay and MCP endpoint are one service (ADR 0001). No per-agent runners.

---

## Rules

- Files under 500 lines. Split if larger.
- Async-first; never block the event loop.
- All external input validated (zod) before use.
- Never log secrets or tokens; never leak internals to the agent in tool errors.
- Tests required for new features and bug fixes (red → green → refactor).
- `npm test`, `npm run typecheck`, and `npm run lint` must all pass before commit.
  (Biome's lint scope is `src/**` + `vitest.config.ts` only; `website/` has its own tooling.)
- Conventional commits, under 50 chars, imperative mood.
