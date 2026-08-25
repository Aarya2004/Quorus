import type { ServerEventBus } from "@modelcontextprotocol/server";
import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AuthConfig } from "../config";
import { MAX_TEXT_LENGTH, RoomNotFoundError } from "../domain/types";
import { log } from "../log";
import type { Store } from "../store/store";
import { resolveMember } from "./auth";
import { PAGE_HTML } from "./page";
import { roomUri } from "./tools";

const DEFAULT_PAGE = 200;
const MAX_PAGE = 500;

const postBody = z.object({ text: z.string().min(1).max(MAX_TEXT_LENGTH) });

/**
 * The human view's JSON + stream API (ADR 0008). Same Member-Token auth as
 * `/mcp`; Watching (GET) never mutates the roster, posting joins first so
 * Membership stays honest. `notifyRoomChanged` publishes the same ping the
 * MCP tools publish, so MCP subscribers and view streams see one event.
 */
export function registerViewApi(
  app: Hono,
  store: Store,
  auth: AuthConfig,
  bus: ServerEventBus,
  notifyRoomChanged: (roomId: string) => void,
): void {
  const authed = (c: Context): string | null => resolveMember(c, auth);

  // The page shell is unauthenticated static HTML; every data endpoint it
  // calls requires a Member Token, and the token itself never enters a URL.
  app.get("/", (c) => c.html(PAGE_HTML));
  app.get("/room/:id", (c) => c.html(PAGE_HTML));

  app.get("/api/me", (c) => {
    const member = authed(c);
    if (!member) return c.json({ error: "unauthorized" }, 401);
    return c.json({ member });
  });

  app.get("/api/rooms", async (c) => {
    if (!authed(c)) return c.json({ error: "unauthorized" }, 401);
    const records = await store.listRooms();
    const rooms = await Promise.all(
      records.map(async (r) => {
        const last = await store.getMessagesBefore(r.roomId, undefined, 1);
        return { ...r, latestSeq: last[0]?.seq ?? 0 };
      }),
    );
    return c.json({ rooms });
  });

  app.get("/api/rooms/:id", async (c) => {
    if (!authed(c)) return c.json({ error: "unauthorized" }, 401);
    const roomId = c.req.param("id");
    const room = await store.getRoom(roomId);
    if (!room) return c.json({ error: "room not found" }, 404);

    const limitRaw = Number(c.req.query("limit") ?? DEFAULT_PAGE);
    const limit = Math.min(
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_PAGE,
      MAX_PAGE,
    );
    const beforeRaw = Number(c.req.query("before") ?? NaN);
    const before = Number.isFinite(beforeRaw) ? beforeRaw : undefined;

    const messages = await store.getMessagesBefore(roomId, before, limit);
    const last = await store.getMessagesBefore(roomId, undefined, 1);
    return c.json({ ...room, messages, latestSeq: last[0]?.seq ?? 0 });
  });

  app.post("/api/rooms/:id/messages", async (c) => {
    const member = authed(c);
    if (!member) return c.json({ error: "unauthorized" }, 401);
    const roomId = c.req.param("id");
    const parsed = postBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "text must be 1..8000 characters" }, 400);
    try {
      // Sending joins first (ADR 0008): the roster records who has spoken.
      await store.joinRoom(roomId, member);
      const msg = await store.appendMessage(roomId, member, parsed.data.text);
      notifyRoomChanged(roomId);
      log.info("view.post", { member, room: roomId, seq: msg.seq });
      return c.json({ seq: msg.seq });
    } catch (err) {
      if (err instanceof RoomNotFoundError) return c.json({ error: "room not found" }, 404);
      throw err;
    }
  });

  app.get("/api/rooms/:id/stream", async (c) => {
    const member = authed(c);
    if (!member) return c.json({ error: "unauthorized" }, 401);
    const roomId = c.req.param("id");
    const room = await store.getRoom(roomId);
    if (!room) return c.json({ error: "room not found" }, 404);

    const sinceRaw = Number(c.req.query("since") ?? NaN);
    let cursor: number;
    if (Number.isFinite(sinceRaw)) {
      cursor = sinceRaw;
    } else {
      const last = await store.getMessagesBefore(roomId, undefined, 1);
      cursor = last[0]?.seq ?? 0;
    }

    return streamSSE(c, async (stream) => {
      let open = true;
      // Serialize pushes so concurrent pings can't interleave frames.
      let chain: Promise<void> = Promise.resolve();
      const push = (): Promise<void> => {
        chain = chain.then(async () => {
          if (!open) return;
          const fresh = await store.getMessages(roomId, cursor);
          for (const m of fresh) {
            cursor = Math.max(cursor, m.seq);
            await stream.writeSSE({ data: JSON.stringify(m) });
          }
        });
        return chain;
      };

      const unsubscribe = bus.subscribe((ev) => {
        if (ev.kind === "resource_updated" && ev.uri === roomUri(roomId)) void push();
      });
      stream.onAbort(() => {
        open = false;
        unsubscribe();
      });
      log.info("view.watch", { member, room: roomId });

      await push(); // catch up anything that landed between page load and stream open
      while (open) {
        await stream.sleep(15000);
        if (open) await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });
}
