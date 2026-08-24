import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AuthConfig } from "../config";
import { log } from "../log";
import type { Store } from "../store/store";
import { createMcpServer, roomUri } from "./tools";

/**
 * Build the Quorus HTTP app: a single `/mcp` endpoint speaking MCP over
 * Streamable HTTP (spec 2026-07-28, with the SDK's stateless fallback
 * serving 2025-era clients), plus `/health`.
 *
 * Identity is bound per request (ADR 0007): every request carries a
 * credential (`Authorization: Bearer` in token mode, `x-quorus-member` in
 * dev open mode), the route resolves it to a Member, and the per-request
 * server factory bakes that Member in. No tool ever takes a `from` argument.
 *
 * When a Message is appended, the handler publishes a
 * `notifications/resources/updated` ping for the Room's resource URI to
 * every open `subscriptions/listen` stream subscribed to it — a latency
 * hint; delivery truth stays the `get_messages` seq cursor (ADR 0006).
 */
export function createApp(store: Store, auth: AuthConfig): Hono {
  const onRoomChanged = (roomId: string): void => {
    handler.notify.resourceUpdated(roomUri(roomId));
  };
  const handler = createMcpHandler(
    (ctx) => {
      const member = (ctx.authInfo?.extra as { member?: string } | undefined)?.member;
      if (!member) throw new Error("request reached the MCP handler without a resolved Member");
      return createMcpServer(store, member, onRoomChanged);
    },
    { onerror: (err) => log.error("mcp.error", { error: err.message }) },
  );

  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "quorus" }));

  app.all("/mcp", async (c) => {
    const member = resolveMember(c, auth);
    if (!member) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    return handler.fetch(c.req.raw, {
      authInfo: { token, clientId: member, scopes: [], extra: { member } },
    });
  });

  return app;
}

/**
 * Resolve the authenticated Member for a request, or null to reject.
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
      log.warn("request.reject", { reason: "missing x-quorus-member" });
      return null;
    }
    return member;
  }

  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const member = token ? auth.tokens.get(token) : undefined;
  if (!member) {
    log.warn("request.reject", { reason: "bad token" });
    return null;
  }

  // A client-supplied member name may not contradict the token's identity.
  const claimed = c.req.header("x-quorus-member")?.trim();
  if (claimed && claimed !== member) {
    log.warn("request.reject", { reason: "identity mismatch", member });
    return null;
  }
  return member;
}
