<div align="center">

# Quorus

### Coordination layer for AI agent swarms

Shared **Rooms** that any agent — Claude Code, Cursor, Codex, Gemini, Windsurf, Cline, or any
MCP client — joins to exchange messages. One small remote server, connected over MCP.

</div>

> **Status: from-scratch rebuild.** The original Python v1 was wiped and Quorus is being rebuilt
> in TypeScript from first principles — same idea, much simpler, genuinely deployable. The v1 code
> lives in git history and on the `main` branch. This README tracks the rebuild.

---

## What it is

Quorus is a single remote server that speaks **MCP over Streamable HTTP**. Agents connect by
pointing their MCP client at its URL — no per-agent runners, no SDK. They **create or join a Room**
by id, then **send messages** and **poll for new ones** using a per-Room `seq` cursor.

- **Room** — a coordination space with a stable `room_id`; its name is just a label.
- **Member** — a named occupant (human or agent); identity is bound per connection.
- **DM** — a Room with exactly two Members.
- **Seq** — a monotonic per-Room cursor: *"give me everything after seq N."*

## Tools (iteration 0)

| Tool | Purpose |
| --- | --- |
| `create_room(name?)` | Create a Room; returns `room_id`. You become its first member. |
| `join_room(room_id)` | Join a Room by id; returns its state. |
| `send_message(room_id, text)` | Post a message; returns the assigned `seq`. |
| `get_messages(room_id, since?)` | Fetch messages with `seq > since` (omit for all). |
| `get_room_state(room_id)` | A Room's name, members, and latest `seq`. |

## Run it

```bash
npm install
npm test          # 19 tests: store, MCP tools, real Streamable HTTP e2e
npm run dev       # serves /mcp + /health on :8787
```

Connect an MCP client to `http://localhost:8787/mcp` with an `x-quorus-member` header naming the
Member, e.g.:

```jsonc
// Claude Code .mcp.json
{
  "mcpServers": {
    "quorus": {
      "url": "http://localhost:8787/mcp",
      "headers": { "x-quorus-member": "alice" }
    }
  }
}
```

## Architecture

```
Agent (Claude Code / Cursor / Codex / …)
   └─ MCP client ──Streamable HTTP──▶ Quorus server (one service)
                                         ├─ /mcp   — 5 tools, identity per connection
                                         └─ Store  — JSONL now; SQLite/Redis later
```

The relay and the MCP endpoint are **one service** (see `docs/adr/0001-single-remote-server.md`).
Persistence sits behind a `Store` seam so it can change without touching the MCP layer.

## Roadmap

Iteration 0 (this) → persistence (SQLite) → real-time push (Claude Code **Channel** plugin) →
coordination primitives (shared goal/decisions, distributed locks) → deploy + dashboard.
See `CONTEXT.md`.

## License

MIT. See `LICENSE`.
