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

  it("accepts a Bearer name as the self-asserted identity (the view's dev path)", async () => {
    const res = await fetch(new URL("/api/me", url), {
      headers: { authorization: "Bearer casey" },
    });
    expect(await res.json()).toEqual({ member: "casey" });
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

describe("human view API", () => {
  let url: URL;
  let close: () => void;
  const auth: AuthConfig = {
    mode: "token",
    tokens: new Map([
      ["tk_alice", "alice"],
      ["tk_bob", "bob"],
    ]),
  };
  beforeAll(async () => ({ url, close } = await startApp(auth)));
  afterAll(() => close());

  const api = (path: string, init?: RequestInit) =>
    fetch(new URL(path, url), {
      ...init,
      headers: { authorization: "Bearer tk_alice", ...(init?.headers ?? {}) },
    });

  it("rejects view requests without a valid Member Token", async () => {
    const res = await fetch(new URL("/api/rooms", url));
    expect(res.status).toBe(401);
  });

  it("identifies the token's Member for the view chrome", async () => {
    expect(await (await api("/api/me")).json()).toEqual({ member: "alice" });
  });

  it("serves the view page shell at / and /room/:id without auth", async () => {
    const index = await fetch(new URL("/", url));
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("Quorus");
    const room = await fetch(new URL("/room/r_whatever", url));
    expect(room.status).toBe(200);
  });

  it("lists Rooms and serves a Room page with backward pagination", async () => {
    expect(await (await api("/api/rooms")).json()).toEqual({ rooms: [] });

    const alice = await connectV2(url, { authorization: "Bearer tk_alice" });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "view" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    for (let i = 1; i <= 5; i++) {
      await alice.callTool({ name: "send_message", arguments: { room_id: roomId, text: `m${i}` } });
    }
    await alice.close();

    const { rooms } = (await (await api("/api/rooms")).json()) as Any;
    expect(rooms[0]).toMatchObject({ roomId, name: "view", latestSeq: 5 });
    expect(rooms[0].preview).toMatchObject({ from: "alice", text: "m5" });

    const page = (await (await api(`/api/rooms/${roomId}?limit=2`)).json()) as Any;
    expect(page).toMatchObject({ roomId, name: "view", members: ["alice"] });
    expect(page.messages.map((m: Any) => m.text)).toEqual(["m4", "m5"]);

    const older = (await (await api(`/api/rooms/${roomId}?limit=2&before=4`)).json()) as Any;
    expect(older.messages.map((m: Any) => m.text)).toEqual(["m2", "m3"]);

    expect((await api("/api/rooms/r_nope")).status).toBe(404);
  });

  it("posting from the view joins the Member and streams live to a watcher", async () => {
    const alice = await connectV2(url, { authorization: "Bearer tk_alice" });
    const created = await alice.callTool({ name: "create_room", arguments: { name: "live" } });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.close();

    // Watcher: hold the stream open, collect data frames.
    const ctrl = new AbortController();
    const streamRes = await api(`/api/rooms/${roomId}/stream`, { signal: ctrl.signal });
    expect(streamRes.status).toBe(200);
    const reader = streamRes.body?.getReader();
    const firstFrame = (async () => {
      const dec = new TextDecoder();
      let buf = "";
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const m = buf.match(/data: (.+)\n/);
        if (m?.[1]) return JSON.parse(m[1]);
      }
      throw new Error("stream ended without data");
    })();

    // Steer: post via the view API. `alice` created the room; post as alice.
    const post = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello from the view" }),
    });
    expect(post.status).toBe(200);
    expect(((await post.json()) as Any).seq).toBe(1);

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("no stream frame in 2s")), 2000),
    );
    const frame = (await Promise.race([firstFrame, timeout])) as Any;
    expect(frame).toMatchObject({ seq: 1, from: "alice", text: "hello from the view" });
    ctrl.abort();

    // Posting joined alice (she was already a member as creator) — assert roster honest.
    const page = (await (await api(`/api/rooms/${roomId}`)).json()) as Any;
    expect(page.members).toContain("alice");
  });

  it("posts mentions from the view, streams them live, and 400s unknown names", async () => {
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "mentions" }),
    });
    const roomId = ((await created.json()) as Any).roomId as string;
    await api(`/api/rooms/${roomId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member: "bob" }),
    });

    // Watcher: hold the stream open, collect the first data frame.
    const ctrl = new AbortController();
    const streamRes = await api(`/api/rooms/${roomId}/stream`, { signal: ctrl.signal });
    const reader = streamRes.body?.getReader();
    const firstFrame = (async () => {
      const dec = new TextDecoder();
      let buf = "";
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const m = buf.match(/data: (.+)\n/);
        if (m?.[1]) return JSON.parse(m[1]);
      }
      throw new Error("stream ended without data");
    })();

    const post = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hey @bob", mentions: ["bob"] }),
    });
    expect(post.status).toBe(200);

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("no stream frame in 2s")), 2000),
    );
    const frame = (await Promise.race([firstFrame, timeout])) as Any;
    expect(frame).toMatchObject({ from: "alice", text: "hey @bob", mentions: ["bob"] });
    ctrl.abort();

    // The page payload carries mentions end to end as well.
    const page = (await (await api(`/api/rooms/${roomId}`)).json()) as Any;
    expect(page.messages.map((m: Any) => m.mentions)).toEqual([["bob"]]);

    // Unknown name: loud 400, nothing stored.
    const bad = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", mentions: ["mallory"] }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Any).error).toBe("mallory is not a member of this room");
    const after = (await (await api(`/api/rooms/${roomId}`)).json()) as Any;
    expect(after.messages).toHaveLength(1);
  });

  it("creates a Room from the view, respecting visibility", async () => {
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "view-born", visibility: "private" }),
    });
    expect(created.status).toBe(200);
    const room = (await created.json()) as Any;
    expect(room).toMatchObject({ name: "view-born", visibility: "private", members: ["alice"] });

    const bobList = (await (
      await fetch(new URL("/api/rooms", url), { headers: { authorization: "Bearer tk_bob" } })
    ).json()) as Any;
    expect(bobList.rooms.map((r: Any) => r.roomId)).not.toContain(room.roomId);
  });

  it("invites and flips visibility from the view; non-members get 403", async () => {
    const created = await api("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "steering" }),
    });
    const { roomId } = (await created.json()) as Any;

    // bob is not a member — no invite/flip authority even on a public Room.
    const bobFlip = await fetch(new URL(`/api/rooms/${roomId}/visibility`, url), {
      method: "POST",
      headers: { authorization: "Bearer tk_bob", "content-type": "application/json" },
      body: JSON.stringify({ visibility: "private" }),
    });
    expect(bobFlip.status).toBe(403);

    const invited = await api(`/api/rooms/${roomId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member: "bob" }),
    });
    expect(((await invited.json()) as Any).members).toEqual(["alice", "bob"]);

    const flipped = await api(`/api/rooms/${roomId}/visibility`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: "private" }),
    });
    expect(((await flipped.json()) as Any).visibility).toBe("private");
  });

  it("hides a private Room from a non-member's view until they are invited", async () => {
    const bobApi = (path: string, init?: RequestInit) =>
      fetch(new URL(path, url), {
        ...init,
        headers: { authorization: "Bearer tk_bob", ...(init?.headers ?? {}) },
      });

    const alice = await connectV2(url, { authorization: "Bearer tk_alice" });
    const created = await alice.callTool({
      name: "create_room",
      arguments: { name: "war-room", visibility: "private" },
    });
    const roomId = (created.structuredContent as Any).roomId as string;

    // To bob the Room does not exist: absent from the picker, 404 everywhere.
    const { rooms } = (await (await bobApi("/api/rooms")).json()) as Any;
    expect(rooms.map((r: Any) => r.roomId)).not.toContain(roomId);
    expect((await bobApi(`/api/rooms/${roomId}`)).status).toBe(404);
    expect((await bobApi(`/api/rooms/${roomId}/stream`)).status).toBe(404);
    const post = await bobApi(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "knock knock" }),
    });
    expect(post.status).toBe(404);

    await alice.callTool({ name: "invite_member", arguments: { room_id: roomId, member: "bob" } });
    await alice.close();

    const page = (await (await bobApi(`/api/rooms/${roomId}`)).json()) as Any;
    expect(page).toMatchObject({ roomId, name: "war-room", visibility: "private" });
  });

  it("rejects an empty or oversize view post", async () => {
    const alice = await connectV2(url, { authorization: "Bearer tk_alice" });
    const created = await alice.callTool({ name: "create_room", arguments: {} });
    const roomId = (created.structuredContent as Any).roomId as string;
    await alice.close();
    const empty = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(empty.status).toBe(400);
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
