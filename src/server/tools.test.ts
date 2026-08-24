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

  it("exposes exactly the five iteration-0 tools", async () => {
    const alice = await connect(store, "alice");
    const { tools } = await alice.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_room",
      "get_messages",
      "get_room_state",
      "join_room",
      "send_message",
    ]);
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
