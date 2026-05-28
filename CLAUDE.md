# CLAUDE.md — Quorus

## Shared Context Protocol

**Read `CONTEXT.md` at the start of every session.** It contains the current project state, what's in progress, recent changes, architectural decisions, and next priorities. It is the shared memory between all contributors' Claude instances.

**Update `CONTEXT.md` after every significant change:**

- Add your changes to "Recent Changes" (keep last 10, drop oldest)
- Update "In Progress" when starting/finishing work
- Update "Current State" if the system's capabilities changed
- Add to "Decisions Made" when architectural choices are made
- Update "Next Up" when priorities shift

---

## Project

Quorus — coordination layer for AI agent swarms. Shared Rooms agents join over MCP to
exchange messages (and, in later iterations, hold distributed locks).

> **Rebuild in progress.** The Python v1 was wiped on 2026-05-28 and is being rebuilt in
> TypeScript from first principles. See `CONTEXT.md` for current state and iteration plan.

**Stack:** TypeScript / Node 20+, `@modelcontextprotocol/sdk` (Streamable HTTP), Hono +
`@hono/mcp`, zod, Vitest, Biome, npm.

**Run tests:** `npm test`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`
**Lint fix:** `npm run lint:fix`
**Dev server:** `npm run dev` (serves `/mcp` + `/health` on `:8787`)

---

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)
   └─ MCP client ──Streamable HTTP──▶ Quorus server (one service: /mcp + Store)
```

- `src/server/app.ts` — Hono app: `/mcp` (Streamable HTTP) + `/health`.
- `src/server/tools.ts` — MCP server with the 5 tools; identity bound per connection.
- `src/store/` — `Store` interface + JSONL implementation (the persistence seam).
- `src/domain/types.ts` — Room, Member, Message, Seq, errors, limits.
- The relay and MCP endpoint are one service (ADR 0001). No per-agent runners.

---

## Rules

- Files under 500 lines. Split if larger.
- Async-first; never block the event loop.
- All external input validated (zod) before use.
- Never log secrets or tokens; never leak internals to the agent in tool errors.
- Tests required for new features and bug fixes (red → green → refactor).
- `npm test`, `npm run typecheck`, and `npm run lint` must all pass before commit.
- Conventional commits, under 50 chars, imperative mood.
