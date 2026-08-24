import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import {
  Client as ClientV2,
  StreamableHTTPClientTransport as HttpTransportV2,
} from "@modelcontextprotocol/client";
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

function connectV2(url: URL, headers: Record<string, string>): Promise<ClientV2> {
  // Pin the 2026-07-28 era: the client's default is the legacy handshake, and a
  // pin fails loudly if the server stops serving the modern revision.
  const client = new ClientV2(
    { name: "test-v2", version: "0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new HttpTransportV2(url, { requestInit: { headers } });
  return client.connect(transport).then(() => client);
}

// The v1-SDK `Client` in these suites is deliberate: it exercises the legacy
// (2025-era) wire that Codex/Cursor still speak, served by the SDK's stateless
// fallback (ADR 0007). Do not migrate these clients to the v2 SDK.
describe("open mode (legacy 2025-era client)", () => {
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

describe("modern era (2026-07-28)", () => {
  let url: URL;
  let close: () => void;
  beforeAll(async () => ({ url, close } = await startApp({ mode: "open" })));
  afterAll(() => close());

  it("exposes a Room as a readable resource", async () => {
    const alice = await connectV2(url, { "x-quorus-member": "alice" });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "obs" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.callTool({
      name: "send_message",
      arguments: { room_id: roomId, text: "visible via resource" },
    });

    const read = await alice.readResource({ uri: `quorus://room/${roomId}` });
    const body = JSON.parse((read.contents[0] as Any).text);
    expect(body.name).toBe("obs");
    expect(body.members).toEqual(["alice"]);
    expect(body.messages).toMatchObject([{ seq: 1, from: "alice", text: "visible via resource" }]);

    await alice.close();
  });

  it("pings a subscribed listener when a Message lands in the Room", async () => {
    const alice = await connectV2(url, { "x-quorus-member": "alice" });
    const bob = await connectV2(url, { "x-quorus-member": "bob" });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "sub" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    await bob.callTool({ name: "join_room", arguments: { room_id: roomId } });

    const uri = `quorus://room/${roomId}`;
    const ping = new Promise<string>((resolve) => {
      bob.setNotificationHandler("notifications/resources/updated", (n) =>
        resolve((n.params as Any).uri),
      );
    });
    const sub = await bob.listen({ resourceSubscriptions: [uri] });
    expect(sub.honoredFilter.resourceSubscriptions).toEqual([uri]);

    await alice.callTool({
      name: "send_message",
      arguments: { room_id: roomId, text: "ping bob" },
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("no ping within 2s")), 2000),
    );
    await expect(Promise.race([ping, timeout])).resolves.toBe(uri);

    await sub.close();
    await alice.close();
    await bob.close();
  });
});

describe("token mode (legacy 2025-era client)", () => {
  let url: URL;
  let close: () => void;
  const auth: AuthConfig = { mode: "token", tokens: new Map([["tk_alice", "alice"]]) };
  beforeAll(async () => ({ url, close } = await startApp(auth)));
  afterAll(() => close());

  it("binds identity per request for a modern (2026-07-28) client", async () => {
    const alice = await connectV2(url, { authorization: "Bearer tk_alice" });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "v2" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: "hi" } });
    const got = await alice.callTool({ name: "get_messages", arguments: { room_id: roomId } });
    expect((got.structuredContent as Any).messages[0]).toMatchObject({ from: "alice" });
    await alice.close();
  });

  it("rejects a modern client with an unknown bearer token", async () => {
    await expect(connectV2(url, { authorization: "Bearer tk_nope" })).rejects.toBeDefined();
  });

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
