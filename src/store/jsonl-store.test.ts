import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoomNotFoundError } from "../domain/types";
import { JsonlStore } from "./jsonl-store";

describe("JsonlStore", () => {
  let dir: string;
  let store: JsonlStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "quorus-store-"));
    store = new JsonlStore(dir);
  });
  afterEach(() => {
    /* temp dirs are reclaimed by the OS; nothing to clean explicitly */
  });

  describe("rooms + membership", () => {
    it("creates a Room with the creator as first Member and a stable id", async () => {
      const room = await store.createRoom("planning", "alice");
      expect(room.roomId).toMatch(/^r_[0-9a-f]+$/);
      expect(room.name).toBe("planning");
      expect(room.members).toEqual(["alice"]);
    });

    it("gives different Rooms different ids even with the same name", async () => {
      const a = await store.createRoom("planning", "alice");
      const b = await store.createRoom("planning", "bob");
      expect(a.roomId).not.toBe(b.roomId);
    });

    it("returns undefined for an unknown Room", async () => {
      expect(await store.getRoom("r_nope")).toBeUndefined();
    });

    it("adds a Member on join and is idempotent", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      const afterFirst = await store.joinRoom(roomId, "bob");
      expect(afterFirst.members).toEqual(["alice", "bob"]);
      const afterSecond = await store.joinRoom(roomId, "bob");
      expect(afterSecond.members).toEqual(["alice", "bob"]);
    });

    it("throws RoomNotFoundError when joining an unknown Room", async () => {
      await expect(store.joinRoom("r_nope", "bob")).rejects.toBeInstanceOf(RoomNotFoundError);
    });
  });

  describe("messages + seq cursor", () => {
    it("assigns a monotonic seq starting at 1", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      const m1 = await store.appendMessage(roomId, "alice", "first");
      const m2 = await store.appendMessage(roomId, "alice", "second");
      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);
    });

    it("returns only messages after the cursor", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      await store.appendMessage(roomId, "alice", "one");
      await store.appendMessage(roomId, "bob", "two");
      await store.appendMessage(roomId, "alice", "three");

      expect((await store.getMessages(roomId)).map((m) => m.text)).toEqual(["one", "two", "three"]);
      expect((await store.getMessages(roomId, 2)).map((m) => m.text)).toEqual(["three"]);
      expect(await store.getMessages(roomId, 99)).toEqual([]);
    });

    it("throws RoomNotFoundError for messages on an unknown Room", async () => {
      await expect(store.getMessages("r_nope")).rejects.toBeInstanceOf(RoomNotFoundError);
      await expect(store.appendMessage("r_nope", "alice", "hi")).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });

    it("keeps seq unique and contiguous under concurrent appends", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      const n = 50;
      await Promise.all(
        Array.from({ length: n }, (_, i) => store.appendMessage(roomId, "alice", `m${i}`)),
      );
      const seqs = (await store.getMessages(roomId)).map((m) => m.seq).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    });

    it("skips a malformed line and keeps reading", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      await store.appendMessage(roomId, "alice", "good-one");
      // Simulate a partial/corrupt write landing in the log.
      await appendFile(join(dir, roomId, "messages.jsonl"), "{not valid json\n", "utf8");
      const msgs = await store.getMessages(roomId);
      expect(msgs.map((m) => m.text)).toEqual(["good-one"]);
    });

    it("persists across a fresh store instance (seq derived from the log)", async () => {
      const { roomId } = await store.createRoom("planning", "alice");
      await store.appendMessage(roomId, "alice", "one");
      await store.appendMessage(roomId, "alice", "two");

      const reopened = new JsonlStore(dir);
      const next = await reopened.appendMessage(roomId, "alice", "three");
      expect(next.seq).toBe(3);
      expect((await reopened.getMessages(roomId)).map((m) => m.text)).toEqual([
        "one",
        "two",
        "three",
      ]);
    });
  });

  it("writes messages as one JSON object per line (JSONL)", async () => {
    const { roomId } = await store.createRoom("planning", "alice");
    await store.appendMessage(roomId, "alice", "one");
    await store.appendMessage(roomId, "bob", "two");
    const raw = await readFile(join(dir, roomId, "messages.jsonl"), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "").text).toBe("one");
    expect(JSON.parse(lines[1] ?? "").from).toBe("bob");
  });
});
