import { serve } from "@hono/node-server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SqliteStore } from "../store/sqlite-store";
import { createApp } from "./app";

let store: SqliteStore;
let url: URL;
let server: ReturnType<typeof serve>;
const cleanup: (() => void | Promise<void>)[] = [];
beforeEach(async () => {
  store = new SqliteStore(":memory:");
  const app = createApp(store, { mode: "open" });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      url = new URL(`http://localhost:${info.port}`);
      resolve();
    });
  });
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  server.close();
  store.close();
});
async function client(member: string) {
  const c = new Client(
    { name: member, version: "1" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  await c.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", url), {
      requestInit: { headers: { "x-quorus-member": member } },
    }),
  );
  cleanup.push(() => c.close());
  return c;
}
async function post(path: string, body: unknown) {
  const r = await fetch(new URL(path, url), {
    method: "POST",
    headers: { authorization: "Bearer alice", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(r.status).toBe(200);
  await r.json();
}
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("stream did not settle")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

it.each([
  "view",
  "mcp",
])("revokes a public watcher when %s makes the Room private", async (surface) => {
  const { roomId } = await store.createRoom("privacy", "alice");
  await store.appendMessage(roomId, "alice", "public");
  const ctrl = new AbortController();
  cleanup.push(() => ctrl.abort());
  const r = await fetch(new URL(`/api/rooms/${roomId}/stream?since=0`, url), {
    headers: { authorization: "Bearer bob" },
    signal: ctrl.signal,
  });
  if (!r.body) throw new Error("missing stream body");
  const reader = r.body.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("public");
  if (surface === "view") await post(`/api/rooms/${roomId}/visibility`, { visibility: "private" });
  else {
    const alice = await client("alice");
    await alice.callTool({
      name: "set_visibility",
      arguments: { room_id: roomId, visibility: "private" },
    });
  }
  await post(`/api/rooms/${roomId}/messages`, { text: "private secret" });
  expect(await within(reader.read())).toMatchObject({ done: true });
});

it("honors only accessible MCP subscriptions, hiding private and nonexistent Rooms alike", async () => {
  const privateRoom = await store.createRoom("private", "alice", "private");
  const publicRoom = await store.createRoom("public", "alice");
  const bob = await client("bob");
  const publicUri = `quorus://room/${publicRoom.roomId}`;
  const sub = await bob.listen({
    resourceSubscriptions: [
      `quorus://room/${privateRoom.roomId}`,
      "quorus://room/r_missing",
      publicUri,
    ],
  });
  cleanup.push(() => sub.close());
  expect(sub.honoredFilter.resourceSubscriptions).toEqual([publicUri]);
});

it.each([
  "view",
  "mcp",
])("filters MCP activity after %s privatizes a watched Room", async (surface) => {
  const watched = await store.createRoom("watched", "alice");
  const control = await store.createRoom("control", "alice");
  const watchedUri = `quorus://room/${watched.roomId}`;
  const controlUri = `quorus://room/${control.roomId}`;
  const bob = await client("bob");
  const received: string[] = [];
  let reachedControl!: () => void;
  const barrier = new Promise<void>((resolve) => {
    reachedControl = resolve;
  });
  bob.setNotificationHandler("notifications/resources/updated", (n) => {
    received.push(n.params.uri);
    if (n.params.uri === controlUri) reachedControl();
  });
  const sub = await bob.listen({ resourceSubscriptions: [watchedUri, controlUri] });
  cleanup.push(() => sub.close());
  if (surface === "view")
    await post(`/api/rooms/${watched.roomId}/visibility`, { visibility: "private" });
  else {
    const alice = await client("alice");
    await alice.callTool({
      name: "set_visibility",
      arguments: { room_id: watched.roomId, visibility: "private" },
    });
  }
  await post(`/api/rooms/${watched.roomId}/messages`, { text: "secret" });
  await post(`/api/rooms/${control.roomId}/messages`, { text: "barrier" });
  await within(barrier);
  expect(received).toEqual([controlUri]);
});

it("delivers private Room updates to invited Members with concurrent outsider subscriptions", async () => {
  const { roomId } = await store.createRoom("private", "alice", "private");
  await store.joinRoom(roomId, "carol");
  const uri = `quorus://room/${roomId}`;
  const [carol, bob] = await Promise.all([client("carol"), client("bob")]);
  let received!: (uri: string) => void;
  const ping = new Promise<string>((resolve) => {
    received = resolve;
  });
  carol.setNotificationHandler("notifications/resources/updated", (n) => received(n.params.uri));
  const [allowed, denied] = await Promise.all([
    carol.listen({ resourceSubscriptions: [uri] }),
    bob.listen({ resourceSubscriptions: [uri] }),
  ]);
  cleanup.push(
    () => allowed.close(),
    () => denied.close(),
  );
  expect(allowed.honoredFilter.resourceSubscriptions).toEqual([uri]);
  expect(denied.honoredFilter.resourceSubscriptions ?? []).toEqual([]);
  await post(`/api/rooms/${roomId}/messages`, { text: "for members" });
  expect(await within(ping)).toBe(uri);
});
