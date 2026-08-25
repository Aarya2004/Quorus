import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import { JsonlStore } from "../store/jsonl-store";
import { createMcpServer } from "./tools";

/** Connect a fresh MCP client acting as `member`, sharing `store`. */
async function connect(store: JsonlStore, member: string): Promise<Client> {
  const server = createMcpServer(store, member);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `test-${member}`, version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

// biome-ignore lint/suspicious/noExplicitAny: tests read loosely-typed tool output
type Any = any;

describe("MCP tools", () => {
  let dir: string;
  let store: JsonlStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "quorus-tools-"));
    store = new JsonlStore(dir);
  });

  it("exposes exactly the eight tools", async () => {
    const alice = await connect(store, "alice");
    const { tools } = await alice.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_room",
      "get_messages",
      "get_room_state",
      "invite_member",
      "join_room",
      "list_rooms",
      "send_message",
      "set_visibility",
    ]);
  });

  it("lists Rooms with roster and latest seq", async () => {
    const alice = await connect(store, "alice");
    const empty = await alice.callTool({ name: "list_rooms", arguments: {} });
    expect((empty.structuredContent as Any).rooms).toEqual([]);

    const created = await alice.callTool({ name: "create_room", arguments: { name: "plan" } });
    const roomId = (created.structuredContent as Any).roomId;
    await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: "hi" } });

    const listed = await alice.callTool({ name: "list_rooms", arguments: {} });
    const rooms = (listed.structuredContent as Any).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ roomId, name: "plan", members: ["alice"], latestSeq: 1 });
  });

  it("runs the DM scenario end to end (the iteration-0 acceptance test)", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");

    const created = await alice.callTool({ name: "create_room", arguments: { name: "plan" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    expect(roomId).toMatch(/^r_/);

    await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });
    await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: "hi bob" } });

    const got = await bob.callTool({
      name: "get_messages",
      arguments: { room_id: roomId, since: 0 },
    });
    const messages = (got.structuredContent as Any).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ from: "alice", text: "hi bob", seq: 1 });

    const state = await bob.callTool({ name: "get_room_state", arguments: { room_id: roomId } });
    expect((state.structuredContent as Any).members).toEqual(["alice", "bob"]);
    expect((state.structuredContent as Any).latestSeq).toBe(1);
  });

  it("binds identity per connection — `from` is the connecting member", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");
    const created = await alice.callTool({ name: "create_room", arguments: {} });
    const roomId = (created.structuredContent as Any).roomId;

    await alice.callTool({
      name: "send_message",
      arguments: { room_id: roomId, text: "from alice" },
    });
    await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });
    await bob.callTool({ name: "send_message", arguments: { room_id: roomId, text: "from bob" } });

    const got = await alice.callTool({ name: "get_messages", arguments: { room_id: roomId } });
    const messages = (got.structuredContent as Any).messages;
    expect(messages.map((m: Any) => m.from)).toEqual(["alice", "bob"]);
  });

  it("returns an error result for an unknown room", async () => {
    const alice = await connect(store, "alice");
    const res = await alice.callTool({ name: "get_room_state", arguments: { room_id: "r_nope" } });
    expect(res.isError).toBe(true);
    const send = await alice.callTool({
      name: "send_message",
      arguments: { room_id: "r_nope", text: "x" },
    });
    expect(send.isError).toBe(true);
  });

  it("makes a private Room indistinguishable from a nonexistent one to non-members", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");
    const created = await alice.callTool({
      name: "create_room",
      arguments: { name: "secret", visibility: "private" },
    });
    expect((created.structuredContent as Any).visibility).toBe("private");
    const roomId = (created.structuredContent as Any).roomId as string;

    const listed = await bob.callTool({ name: "list_rooms", arguments: {} });
    expect((listed.structuredContent as Any).rooms).toEqual([]);

    for (const probe of [
      { name: "join_room", arguments: { room_id: roomId } },
      { name: "get_messages", arguments: { room_id: roomId } },
      { name: "get_room_state", arguments: { room_id: roomId } },
      { name: "send_message", arguments: { room_id: roomId, text: "let me in" } },
    ]) {
      const res = await bob.callTool(probe);
      expect(res.isError).toBe(true);
      expect((res.content as Any)[0].text).toBe(`Room not found: ${roomId}`);
    }
    await expect(bob.readResource({ uri: `quorus://room/${roomId}` })).rejects.toBeDefined();

    // The creator still has full access.
    const mine = await alice.callTool({ name: "get_room_state", arguments: { room_id: roomId } });
    expect(mine.isError).toBeFalsy();
  });

  it("invite_member adds the invitee directly to the roster with full access", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");
    const created = await alice.callTool({
      name: "create_room",
      arguments: { name: "secret", visibility: "private" },
    });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: "hi bob" } });

    const invited = await alice.callTool({
      name: "invite_member",
      arguments: { room_id: roomId, member: "bob" },
    });
    expect((invited.structuredContent as Any).members).toEqual(["alice", "bob"]);

    const got = await bob.callTool({ name: "get_messages", arguments: { room_id: roomId } });
    expect((got.structuredContent as Any).messages).toMatchObject([
      { from: "alice", text: "hi bob" },
    ]);
    const sent = await bob.callTool({
      name: "send_message",
      arguments: { room_id: roomId, text: "thanks" },
    });
    expect((sent.structuredContent as Any).seq).toBe(2);
  });

  it("only a Member of the Room can invite or flip visibility", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");
    const created = await alice.callTool({ name: "create_room", arguments: { name: "open" } });
    const roomId = (created.structuredContent as Any).roomId as string;

    // Public Room, but bob is not on the roster — no invite/flip authority.
    const invite = await bob.callTool({
      name: "invite_member",
      arguments: { room_id: roomId, member: "mallory" },
    });
    expect(invite.isError).toBe(true);
    const flip = await bob.callTool({
      name: "set_visibility",
      arguments: { room_id: roomId, visibility: "private" },
    });
    expect(flip.isError).toBe(true);
  });

  it("set_visibility gates and un-gates an existing Room", async () => {
    const alice = await connect(store, "alice");
    const bob = await connect(store, "bob");
    const created = await alice.callTool({ name: "create_room", arguments: { name: "plan" } });
    const roomId = (created.structuredContent as Any).roomId as string;

    const gated = await alice.callTool({
      name: "set_visibility",
      arguments: { room_id: roomId, visibility: "private" },
    });
    expect((gated.structuredContent as Any).visibility).toBe("private");
    const denied = await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });
    expect(denied.isError).toBe(true);

    await alice.callTool({
      name: "set_visibility",
      arguments: { room_id: roomId, visibility: "public" },
    });
    const joined = await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });
    expect(joined.isError).toBeFalsy();
  });

  it("rejects empty message text", async () => {
    const alice = await connect(store, "alice");
    const created = await alice.callTool({ name: "create_room", arguments: {} });
    const roomId = (created.structuredContent as Any).roomId;
    const res = await alice
      .callTool({ name: "send_message", arguments: { room_id: roomId, text: "" } })
      .catch(() => ({ isError: true }));
    expect((res as Any).isError).toBe(true);
  });
});
