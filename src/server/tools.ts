import type { CallToolResult } from "@modelcontextprotocol/server";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  canAccess,
  invalidMention,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  RoomNotFoundError,
  type RoomRecord,
  type Visibility,
} from "../domain/types";
import { log } from "../log";
import type { Store } from "../store/store";

/** The URI under which a Room is exposed as a subscribable MCP resource. */
export const roomUri = (roomId: string): string => `quorus://room/${roomId}`;

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
 * Build an MCP server whose tools act as `member`. The factory in `app.ts`
 * calls this once per HTTP request (spec 2026-07-28 is stateless), with
 * `member` resolved from that request's credential — so the tools never take
 * a `from` argument and a Member cannot spoof its name (ADR 0005/0007).
 *
 * `onRoomChanged` is invoked after a Message is appended so the app can
 * publish a `notifications/resources/updated` ping for the Room's resource
 * URI to any `subscriptions/listen` stream — a latency hint only; delivery
 * truth stays the `get_messages` seq cursor (ADR 0006/0007).
 */
export function createMcpServer(
  store: Store,
  member: string,
  onRoomChanged?: (roomId: string) => void,
): McpServer {
  const server = new McpServer(
    { name: "quorus", version: "0.0.0" },
    {
      capabilities: { resources: { subscribe: true } },
      instructions: [
        "Quorus is a coordination layer for AI agent swarms: shared Rooms where agents",
        "and humans exchange messages.",
        "",
        "Workflow:",
        "1. create_room — start a Room. You get a room_id and become its first member.",
        "   Share the room_id with collaborators out-of-band so they can join.",
        "2. join_room — join an existing Room by its room_id.",
        "3. send_message — post a message to a Room; `mentions` requests roster Members' attention.",
        "4. get_messages — poll a Room for messages. Pass `since` set to the last seq you",
        "   saw to fetch only what's new (omit it to get everything).",
        "5. get_room_state — see who is in a Room and its latest seq.",
        "6. list_rooms — discover Rooms. Private Rooms only appear if you are a member.",
        "7. invite_member — add a Member to a Room's roster (the entry to a private Room).",
        "8. set_visibility — make a Room public (open to all) or private (roster-only).",
        "",
        "Your member identity is fixed by your credential — you never pass a sender.",
        "When catching up, check get_messages with `mentions_me: true` first, then read",
        "surrounding context before acting. A mention requests attention; there is no obligation to respond.",
        "send_message accepts `mentions`, and every mentioned name must be a Room roster member.",
        "A two-member Room is a DM. Delivery is pull-based: poll get_messages to catch up.",
        "Each Room is also readable as the resource quorus://room/<room_id>; subscribe to",
        "it to receive updated-pings when new messages arrive (then poll to fetch them).",
      ].join("\n"),
    },
  );

  /**
   * The roster gate (ADR 0009): resolve a Room the acting member may access.
   * A private Room is indistinguishable from a nonexistent one to outsiders.
   */
  const accessibleRoom = async (roomId: string): Promise<RoomRecord> => {
    const room = await store.getRoom(roomId);
    if (!room || !canAccess(room, member)) throw new RoomNotFoundError(roomId);
    return room;
  };

  server.registerTool(
    "create_room",
    {
      title: "Create room",
      description:
        "Create a new Room and return its room_id. You become its first member. " +
        "Visibility defaults to public; a private Room admits only invited Members.",
      inputSchema: z.object({
        name: z.string().max(MAX_NAME_LENGTH).optional(),
        visibility: z.enum(["public", "private"]).optional(),
      }),
    },
    logged(
      "create_room",
      member,
      async ({ name, visibility }: { name?: string; visibility?: Visibility }) => {
        const room = await store.createRoom(name?.trim() || "room", member, visibility);
        return ok(`Created ${room.visibility} room "${room.name}" (${room.roomId}).`, { ...room });
      },
    ),
  );

  server.registerTool(
    "join_room",
    {
      title: "Join room",
      description: "Join an existing Room by room_id. Returns the Room's current state.",
      inputSchema: z.object({ room_id: z.string().min(1) }),
    },
    logged("join_room", member, async ({ room_id }: { room_id: string }) => {
      await accessibleRoom(room_id);
      const room = await store.joinRoom(room_id, member);
      return ok(`Joined "${room.name}" (${room.roomId}). Members: ${room.members.join(", ")}.`, {
        ...room,
      });
    }),
  );

  server.registerTool(
    "invite_member",
    {
      title: "Invite member",
      description:
        "Add a Member to a Room's roster. The only entry to a private Room; " +
        "the invitee can read and send immediately.",
      inputSchema: z.object({
        room_id: z.string().min(1),
        member: z.string().min(1).max(MAX_NAME_LENGTH),
      }),
    },
    logged(
      "invite_member",
      member,
      async ({ room_id, member: invitee }: { room_id: string; member: string }) => {
        const room = await accessibleRoom(room_id);
        if (!room.members.includes(member))
          return fail("Only a member of the Room can invite. Join it first.");
        const updated = await store.joinRoom(room_id, invitee);
        return ok(
          `Invited ${invitee} to "${updated.name}". Members: ${updated.members.join(", ")}.`,
          { ...updated },
        );
      },
    ),
  );

  server.registerTool(
    "set_visibility",
    {
      title: "Set visibility",
      description:
        "Make a Room public (open to all Members) or private (roster-only). " +
        "Flipping public exposes the Room's entire history.",
      inputSchema: z.object({
        room_id: z.string().min(1),
        visibility: z.enum(["public", "private"]),
      }),
    },
    logged(
      "set_visibility",
      member,
      async ({ room_id, visibility }: { room_id: string; visibility: Visibility }) => {
        const room = await accessibleRoom(room_id);
        if (!room.members.includes(member))
          return fail("Only a member of the Room can change its visibility. Join it first.");
        const updated = await store.setVisibility(room_id, visibility);
        return ok(`"${updated.name}" (${updated.roomId}) is now ${updated.visibility}.`, {
          ...updated,
        });
      },
    ),
  );

  server.registerTool(
    "send_message",
    {
      title: "Send message",
      description:
        "Post a message to a Room. Mentions request Members' attention and must name roster members. " +
        "Returns the assigned seq.",
      inputSchema: z.object({
        room_id: z.string().min(1),
        text: z.string().min(1).max(MAX_TEXT_LENGTH),
        mentions: z.array(z.string().min(1).max(MAX_NAME_LENGTH)).optional(),
      }),
    },
    logged(
      "send_message",
      member,
      async ({
        room_id,
        text,
        mentions,
      }: {
        room_id: string;
        text: string;
        mentions?: string[];
      }) => {
        const room = await accessibleRoom(room_id);
        const nonmember = invalidMention(room, mentions);
        if (nonmember) return fail(`${nonmember} is not a member of this room`);
        const msg = await store.appendMessage(room_id, member, text, mentions);
        onRoomChanged?.(room_id);
        return ok(`Sent (seq ${msg.seq}).`, { seq: msg.seq });
      },
    ),
  );

  server.registerTool(
    "get_messages",
    {
      title: "Get messages",
      description:
        "Fetch messages from a Room with seq greater than `since` (omit to get all). " +
        "Set `mentions_me` to only fetch messages that mention you.",
      inputSchema: z.object({
        room_id: z.string().min(1),
        since: z.number().int().min(0).optional(),
        mentions_me: z.boolean().optional(),
      }),
    },
    logged(
      "get_messages",
      member,
      async ({
        room_id,
        since,
        mentions_me,
      }: {
        room_id: string;
        since?: number;
        mentions_me?: boolean;
      }) => {
        await accessibleRoom(room_id);
        const messages = await store.getMessages(room_id, since, mentions_me ? member : undefined);
        const text = messages.length
          ? messages.map((m) => `[${m.seq}] ${m.from}: ${m.text}`).join("\n")
          : "(no new messages)";
        return ok(text, { messages });
      },
    ),
  );

  server.registerTool(
    "list_rooms",
    {
      title: "List rooms",
      description: "List all Rooms with their members and latest seq, oldest first.",
      inputSchema: z.object({}),
    },
    logged("list_rooms", member, async () => {
      const records = (await store.listRooms()).filter((r) => canAccess(r, member));
      const rooms = await Promise.all(
        records.map(async (r) => {
          const last = await store.getMessagesBefore(r.roomId, undefined, 1);
          return { ...r, latestSeq: last[0]?.seq ?? 0 };
        }),
      );
      const text = rooms.length
        ? rooms
            .map((r) => `${r.name} (${r.roomId}) — ${r.members.length} members, seq ${r.latestSeq}`)
            .join("\n")
        : "(no rooms)";
      return ok(text, { rooms });
    }),
  );

  server.registerTool(
    "get_room_state",
    {
      title: "Get room state",
      description: "Return a Room's name, members, and latest seq.",
      inputSchema: z.object({ room_id: z.string().min(1) }),
    },
    logged("get_room_state", member, async ({ room_id }: { room_id: string }) => {
      const room = await accessibleRoom(room_id);
      const messages = await store.getMessages(room_id, 0);
      const latestSeq = messages.reduce((max, m) => Math.max(max, m.seq), 0);
      return ok(
        `${room.name} (${room.roomId}) — members: ${room.members.join(", ")}; latest seq ${latestSeq}.`,
        { roomId: room.roomId, name: room.name, members: room.members, latestSeq },
      );
    }),
  );

  server.registerResource(
    "room",
    new ResourceTemplate("quorus://room/{roomId}", { list: undefined }),
    {
      title: "Room",
      description:
        "A Room's state and full message log as JSON. Subscribe to receive updated-pings.",
      mimeType: "application/json",
    },
    async (uri, { roomId }) => {
      const id = String(roomId);
      const room = await accessibleRoom(id);
      const messages = await store.getMessages(id, 0);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              roomId: room.roomId,
              name: room.name,
              members: room.members,
              messages,
            }),
          },
        ],
      };
    },
  );

  return server;
}
