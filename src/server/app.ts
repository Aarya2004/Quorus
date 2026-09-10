import { createMcpHandler, InMemoryServerEventBus } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import type { AuthConfig } from "../config";
import { log } from "../log";
import type { Store } from "../store/store";
import { resolveMember } from "./auth";
import { roomSubscriptions } from "./subscriptions";
import { createMcpServer, roomUri } from "./tools";
import { registerViewApi } from "./view";

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
  const bus = new InMemoryServerEventBus();
  const subscriptions = roomSubscriptions(store, bus);
  const onRoomChanged = (roomId: string): void => {
    bus.publish({ kind: "resource_updated", uri: roomUri(roomId) });
  };
  const handler = createMcpHandler(
    (ctx) => {
      const member = (ctx.authInfo?.extra as { member?: string } | undefined)?.member;
      if (!member) throw new Error("request reached the MCP handler without a resolved Member");
      return createMcpServer(store, member, onRoomChanged);
    },
    { bus: subscriptions.bus, onerror: (err) => log.error("mcp.error", { error: err.message }) },
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
    const body =
      c.req.method === "POST"
        ? await c.req.raw
            .clone()
            .json()
            .catch(() => undefined)
        : undefined;
    const parsedBody = await subscriptions.filter(body, member);
    return subscriptions.run(member, () =>
      handler.fetch(c.req.raw, {
        parsedBody,
        authInfo: { token, clientId: member, scopes: [], extra: { member } },
      }),
    );
  });

  registerViewApi(app, store, auth, bus, onRoomChanged);

  return app;
}
