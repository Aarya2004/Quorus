import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MAX_NAME_LENGTH, MAX_TEXT_LENGTH, RoomNotFoundError } from "../domain/types";
import { log } from "../log";
import type { Store } from "../store/store";

function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return structured
    ? { content: [{ type: "text", text }], structuredContent: structured }
    : { content: [{ type: "text", text }] };
}

function fail(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function firstText(result: CallToolResult): string | undefined {
  const block = result.content?.[0];
  return block && block.type === "text" ? block.text : undefined;
}

/**
 * Wrap a tool handler with timing, structured logging, and uniform error
 * handling. Handlers just do the work and throw on failure; this turns a
 * RoomNotFoundError into a safe client error and anything else into a generic
 * one (never leaking internals). Empty reads log at `debug` so idle polling
 * doesn't drown the logs.
 */
function logged<A>(
  tool: string,
  member: string,
  handler: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A): Promise<CallToolResult> => {
    const start = performance.now();
    const roomRaw = (args as { room_id?: unknown }).room_id;
    const room = typeof roomRaw === "string" ? roomRaw : undefined;
    try {
      const result = await handler(args);
      const ms = Math.round(performance.now() - start);
      const sc = result.structuredContent as Record<string, unknown> | undefined;
      const count = Array.isArray(sc?.messages) ? sc.messages.length : undefined;
      const seq = typeof sc?.seq === "number" ? sc.seq : undefined;
      if (result.isError) {
        log.warn("tool.err", { tool, member, room, ms, reason: firstText(result) });
      } else {
        log[count === 0 ? "debug" : "info"]("tool.ok", { tool, member, room, ms, seq, count });
      }
      return result;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      if (err instanceof RoomNotFoundError) {
        log.warn("tool.err", { tool, member, room, ms, reason: "room not found" });
        return fail(err.message);
      }
      log.error("tool.crash", {
        tool,
        member,
        room,
        ms,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail("Internal error handling the request.");
    }
  };
}

/**
 * Build an MCP server whose tools act as `member`. Identity is bound here, at
 * connection time, so the tools themselves never take a `from` argument and a
 * Member cannot spoof its name mid-session.
 */
export function createMcpServer(store: Store, member: string): McpServer {
  const server = new McpServer(
    { name: "quorus", version: "0.0.0" },
    {
      instructions: [
        "Quorus is a coordination layer for AI agent swarms: shared Rooms where agents",
        "and humans exchange messages.",
        "",
        "Workflow:",
        "1. create_room — start a Room. You get a room_id and become its first member.",
        "   Share the room_id with collaborators out-of-band so they can join.",
        "2. join_room — join an existing Room by its room_id.",
        "3. send_message — post a message to a Room.",
        "4. get_messages — poll a Room for messages. Pass `since` set to the last seq you",
        "   saw to fetch only what's new (omit it to get everything).",
        "5. get_room_state — see who is in a Room and its latest seq.",
        "",
        "Your member identity is fixed for this connection — you never pass a sender.",
        "A two-member Room is a DM. Delivery is pull-based: poll get_messages to catch up.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "create_room",
    {
      title: "Create room",
      description: "Create a new Room and return its room_id. You become its first member.",
      inputSchema: { name: z.string().max(MAX_NAME_LENGTH).optional() },
    },
    logged("create_room", member, async ({ name }: { name?: string }) => {
      const room = await store.createRoom(name?.trim() || "room", member);
      return ok(`Created room "${room.name}" (${room.roomId}).`, { ...room });
    }),
  );

  server.registerTool(
    "join_room",
    {
      title: "Join room",
      description: "Join an existing Room by room_id. Returns the Room's current state.",
      inputSchema: { room_id: z.string().min(1) },
    },
    logged("join_room", member, async ({ room_id }: { room_id: string }) => {
      const room = await store.joinRoom(room_id, member);
      return ok(`Joined "${room.name}" (${room.roomId}). Members: ${room.members.join(", ")}.`, {
        ...room,
      });
    }),
  );

  server.registerTool(
    "send_message",
    {
      title: "Send message",
      description: "Post a message to a Room. Returns the assigned seq.",
      inputSchema: { room_id: z.string().min(1), text: z.string().min(1).max(MAX_TEXT_LENGTH) },
    },
    logged("send_message", member, async ({ room_id, text }: { room_id: string; text: string }) => {
      const msg = await store.appendMessage(room_id, member, text);
      return ok(`Sent (seq ${msg.seq}).`, { seq: msg.seq });
    }),
  );

  server.registerTool(
    "get_messages",
    {
      title: "Get messages",
      description: "Fetch messages from a Room with seq greater than `since` (omit to get all).",
      inputSchema: { room_id: z.string().min(1), since: z.number().int().min(0).optional() },
    },
    logged(
      "get_messages",
      member,
      async ({ room_id, since }: { room_id: string; since?: number }) => {
        const messages = await store.getMessages(room_id, since);
        const text = messages.length
          ? messages.map((m) => `[${m.seq}] ${m.from}: ${m.text}`).join("\n")
          : "(no new messages)";
        return ok(text, { messages });
      },
    ),
  );

  server.registerTool(
    "get_room_state",
    {
      title: "Get room state",
      description: "Return a Room's name, members, and latest seq.",
      inputSchema: { room_id: z.string().min(1) },
    },
    logged("get_room_state", member, async ({ room_id }: { room_id: string }) => {
      const room = await store.getRoom(room_id);
      if (!room) throw new RoomNotFoundError(room_id);
      const messages = await store.getMessages(room_id, 0);
      const latestSeq = messages.reduce((max, m) => Math.max(max, m.seq), 0);
      return ok(
        `${room.name} (${room.roomId}) — members: ${room.members.join(", ")}; latest seq ${latestSeq}.`,
        { roomId: room.roomId, name: room.name, members: room.members, latestSeq },
      );
    }),
  );

  return server;
}
