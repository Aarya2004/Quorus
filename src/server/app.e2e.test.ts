import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JsonlStore } from "../store/jsonl-store";
import { createApp } from "./app";

// biome-ignore lint/suspicious/noExplicitAny: tests read loosely-typed tool output
type Any = any;

let httpServer: { close: () => void };
let mcpUrl: URL;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "quorus-http-"));
  const app = createApp(new JsonlStore(dir));
  await new Promise<void>((resolve) => {
    httpServer = serve({ fetch: app.fetch, port: 0 }, (info) => {
      mcpUrl = new URL(`http://localhost:${info.port}/mcp`);
      resolve();
    });
  });
});

afterAll(() => httpServer?.close());

async function connect(member: string): Promise<Client> {
  const client = new Client({ name: member, version: "0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: { headers: { "x-quorus-member": member } },
  });
  await client.connect(transport);
  return client;
}

it("runs the DM scenario over real Streamable HTTP", async () => {
  const alice = await connect("alice");
  const bob = await connect("bob");

  const created = await alice.callTool({ name: "create_room", arguments: { name: "plan" } });
  const roomId = (created.structuredContent as Any).roomId as string;
  expect(roomId).toMatch(/^r_/);

  await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });
  await alice.callTool({
    name: "send_message",
    arguments: { room_id: roomId, text: "hi over http" },
  });

  const got = await bob.callTool({
    name: "get_messages",
    arguments: { room_id: roomId, since: 0 },
  });
  const messages = (got.structuredContent as Any).messages;
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ from: "alice", text: "hi over http", seq: 1 });

  const state = await bob.callTool({ name: "get_room_state", arguments: { room_id: roomId } });
  expect((state.structuredContent as Any).members).toEqual(["alice", "bob"]);

  await alice.close();
  await bob.close();
});

it("rejects a connection with no member identity", async () => {
  const client = new Client({ name: "anon", version: "0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl); // no x-quorus-member header
  await expect(client.connect(transport)).rejects.toBeDefined();
});
