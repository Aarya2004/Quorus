import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlStore } from "./jsonl-store";
import { storeContract } from "./store-contract";

storeContract("JsonlStore", (path) => new JsonlStore(path));

describe("JsonlStore (file format)", () => {
  async function freshStore(): Promise<{ dir: string; store: JsonlStore }> {
    const dir = await mkdtemp(join(tmpdir(), "quorus-jsonl-"));
    return { dir, store: new JsonlStore(dir) };
  }

  it("writes messages as one JSON object per line (JSONL)", async () => {
    const { dir, store } = await freshStore();
    const { roomId } = await store.createRoom("planning", "alice");
    await store.appendMessage(roomId, "alice", "one");
    await store.appendMessage(roomId, "bob", "two");
    const raw = await readFile(join(dir, roomId, "messages.jsonl"), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "").text).toBe("one");
    expect(JSON.parse(lines[1] ?? "").from).toBe("bob");
  });

  it("skips a malformed line and keeps reading", async () => {
    const { dir, store } = await freshStore();
    const { roomId } = await store.createRoom("planning", "alice");
    await store.appendMessage(roomId, "alice", "good-one");
    // Simulate a partial/corrupt write landing in the log.
    await appendFile(join(dir, roomId, "messages.jsonl"), "{not valid json\n", "utf8");
    const msgs = await store.getMessages(roomId);
    expect(msgs.map((m) => m.text)).toEqual(["good-one"]);
  });
});
