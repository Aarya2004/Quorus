import { randomUUID } from "node:crypto";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AuthConfig } from "../config";
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
export function createApp(store: Store, auth: AuthConfig): Hono {
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

    // New session — resolve and authenticate the Member identity.
    const member = resolveMember(c, auth);
    if (!member) {
      return c.json({ error: "unauthorized" }, 401);
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

/**
 * Resolve the authenticated Member for a new session, or null to reject.
 *
 * - `open`: identity is the self-asserted `x-quorus-member` header (dev only).
 * - `token`: identity is *derived* from the `Authorization: Bearer` token; a
 *   client-supplied `x-quorus-member` may not contradict it (it can fail a
 *   request, never grant an identity). Tokens are never logged.
 */
function resolveMember(c: Context, auth: AuthConfig): string | null {
  if (auth.mode === "open") {
    const member = c.req.header("x-quorus-member")?.trim();
    if (!member) {
      log.warn("session.reject", { reason: "missing x-quorus-member" });
      return null;
    }
    return member;
  }

  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const member = token ? auth.tokens.get(token) : undefined;
  if (!member) {
    log.warn("session.reject", { reason: "bad token" });
    return null;
  }

  // A client-supplied member name may not contradict the token's identity.
  const claimed = c.req.header("x-quorus-member")?.trim();
  if (claimed && claimed !== member) {
    log.warn("session.reject", { reason: "identity mismatch", member });
    return null;
  }
  return member;
}
