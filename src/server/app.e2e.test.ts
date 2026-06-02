import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthConfig } from "../config";
import { SqliteStore } from "../store/sqlite-store";
import { createApp } from "./app";

// biome-ignore lint/suspicious/noExplicitAny: tests read loosely-typed tool output
type Any = any;

async function startApp(auth: AuthConfig): Promise<{ url: URL; close: () => void }> {
  const dir = await mkdtemp(join(tmpdir(), "quorus-http-"));
  const app = createApp(new SqliteStore(join(dir, "quorus.db")), auth);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({ url: new URL(`http://localhost:${info.port}/mcp`), close: () => server.close() });
    });
  });
}

function connect(url: URL, headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "test", version: "0" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  return client.connect(transport).then(() => client);
}

describe("open mode", () => {
  let url: URL;
  let close: () => void;
  beforeAll(async () => ({ url, close } = await startApp({ mode: "open" })));
  afterAll(() => close());

  it("runs the DM scenario over real Streamable HTTP", async () => {
    const alice = await connect(url, { "x-quorus-member": "alice" });
    const bob = await connect(url, { "x-quorus-member": "bob" });

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
    const transport = new StreamableHTTPClientTransport(url); // no x-quorus-member header
    await expect(client.connect(transport)).rejects.toBeDefined();
  });
});

describe("token mode", () => {
  let url: URL;
  let close: () => void;
  const auth: AuthConfig = { mode: "token", tokens: new Map([["tk_alice", "alice"]]) };
  beforeAll(async () => ({ url, close } = await startApp(auth)));
  afterAll(() => close());

  it("binds identity from a valid bearer token", async () => {
    const alice = await connect(url, { authorization: "Bearer tk_alice" });

    const created = await alice.callTool({ name: "create_room", arguments: { name: "plan" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: "yo" } });

    const got = await alice.callTool({
      name: "get_messages",
      arguments: { room_id: roomId, since: 0 },
    });
    expect((got.structuredContent as Any).messages[0]).toMatchObject({ from: "alice" });

    await alice.close();
  });

  it("rejects an unknown bearer token", async () => {
    await expect(connect(url, { authorization: "Bearer tk_nope" })).rejects.toBeDefined();
  });

  it("rejects a connection with no token", async () => {
    await expect(connect(url, {})).rejects.toBeDefined();
  });

  it("rejects a token whose member contradicts x-quorus-member", async () => {
    await expect(
      connect(url, { authorization: "Bearer tk_alice", "x-quorus-member": "bob" }),
    ).rejects.toBeDefined();
  });

  it("accepts x-quorus-member that matches the token's member", async () => {
    const alice = await connect(url, {
      authorization: "Bearer tk_alice",
      "x-quorus-member": "alice",
    });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "ok" } });
    expect((created.structuredContent as Any).roomId).toMatch(/^r_/);
    await alice.close();
  });
});
