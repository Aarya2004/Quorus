import { randomUUID } from "node:crypto";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { log } from "../log";
import type { Store } from "../store/store";
import { createMcpServer } from "./tools";

const short = (id: string | undefined): string | undefined => id?.slice(0, 8);

/**
 * Build the Quorus HTTP app: a single `/mcp` endpoint speaking MCP over
 * Streamable HTTP, plus `/health`.
 *
 * Identity is bound per connection. The first request of a session (the MCP
 * `initialize`) must carry an `x-quorus-member` header; that name is baked into
 * the session's MCP server, and every later request reuses it via the
 * `mcp-session-id` header. No tool ever takes a `from` argument.
 */
export function createApp(store: Store): Hono {
  const app = new Hono();
  const sessions = new Map<string, StreamableHTTPTransport>();

  app.get("/health", (c) => c.json({ ok: true, service: "quorus" }));

  app.all("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    // Continuation of an established session.
    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) {
        log.warn("session.unknown", { session: short(sessionId) });
        return c.json({ error: "unknown session" }, 404);
      }
      return (await transport.handleRequest(c)) ?? c.body(null, 204);
    }

    // New session — must declare a Member identity.
    const member = c.req.header("x-quorus-member")?.trim();
    if (!member) {
      log.warn("session.reject", { reason: "missing x-quorus-member" });
      return c.json({ error: "x-quorus-member header required" }, 401);
    }

    const transport: StreamableHTTPTransport = new StreamableHTTPTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        sessions.set(id, transport);
        log.info("session.open", { member, session: short(id) });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        log.info("session.close", { member, session: short(transport.sessionId) });
      }
    };

    const server = createMcpServer(store, member);
    await server.connect(transport);
    return (await transport.handleRequest(c)) ?? c.body(null, 204);
  });

  return app;
}
