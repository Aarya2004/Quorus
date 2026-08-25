import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomNotFoundError } from "../domain/types";
import type { Store } from "./store";

/**
 * Behavioural contract every Store must satisfy. Both JsonlStore and SqliteStore
 * run this identical suite, guaranteeing the persistence seam is honoured the
 * same way regardless of backend.
 *
 * `makeStore(path)` builds a store rooted at `path` — a directory for the JSONL
 * store, a database file for SQLite. Calling it twice with the same path must
 * reopen the same data (used by the persistence test).
 */
export function storeContract(label: string, makeStore: (path: string) => Store): void {
  describe(`Store contract: ${label}`, () => {
    async function freshPath(): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), "quorus-contract-"));
      return join(dir, "store");
    }

    it("creates a Room with the creator as first Member and a stable id", async () => {
      const store = makeStore(await freshPath());
      const room = await store.createRoom("planning", "alice");
      expect(room.roomId).toMatch(/^r_[0-9a-f]+$/);
      expect(room.name).toBe("planning");
      expect(room.members).toEqual(["alice"]);
    });

    it("gives different Rooms different ids even with the same name", async () => {
      const store = makeStore(await freshPath());
      const a = await store.createRoom("planning", "alice");
      const b = await store.createRoom("planning", "bob");
      expect(a.roomId).not.toBe(b.roomId);
    });

    it("returns undefined for an unknown Room", async () => {
      const store = makeStore(await freshPath());
      expect(await store.getRoom("r_nope")).toBeUndefined();
    });

    it("adds a Member on join, preserves order, and is idempotent", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      expect((await store.joinRoom(roomId, "bob")).members).toEqual(["alice", "bob"]);
      expect((await store.joinRoom(roomId, "bob")).members).toEqual(["alice", "bob"]);
    });

    it("throws RoomNotFoundError when joining an unknown Room", async () => {
      const store = makeStore(await freshPath());
      await expect(store.joinRoom("r_nope", "bob")).rejects.toBeInstanceOf(RoomNotFoundError);
    });

    it("assigns a monotonic seq starting at 1", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      expect((await store.appendMessage(roomId, "alice", "first")).seq).toBe(1);
      expect((await store.appendMessage(roomId, "alice", "second")).seq).toBe(2);
    });

    it("returns only messages after the cursor", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      await store.appendMessage(roomId, "alice", "one");
      await store.appendMessage(roomId, "bob", "two");
      await store.appendMessage(roomId, "alice", "three");

      expect((await store.getMessages(roomId)).map((m) => m.text)).toEqual(["one", "two", "three"]);
      expect((await store.getMessages(roomId, 2)).map((m) => m.text)).toEqual(["three"]);
      expect(await store.getMessages(roomId, 99)).toEqual([]);
    });

    it("records `from` as the sender on each message", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      await store.appendMessage(roomId, "alice", "hi");
      await store.appendMessage(roomId, "bob", "yo");
      expect((await store.getMessages(roomId)).map((m) => m.from)).toEqual(["alice", "bob"]);
    });

    it("throws RoomNotFoundError for messages on an unknown Room", async () => {
      const store = makeStore(await freshPath());
      await expect(store.getMessages("r_nope")).rejects.toBeInstanceOf(RoomNotFoundError);
      await expect(store.appendMessage("r_nope", "alice", "hi")).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });

    it("keeps seq unique and contiguous under concurrent appends", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      const n = 50;
      await Promise.all(
        Array.from({ length: n }, (_, i) => store.appendMessage(roomId, "alice", `m${i}`)),
      );
      const seqs = (await store.getMessages(roomId)).map((m) => m.seq).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    });

    it("pages backwards: latest `limit` messages, then older before a cursor", async () => {
      const store = makeStore(await freshPath());
      const { roomId } = await store.createRoom("planning", "alice");
      for (let i = 1; i <= 7; i++) await store.appendMessage(roomId, "alice", `m${i}`);

      // No cursor: the newest `limit`, still in ascending seq order.
      const tail = await store.getMessagesBefore(roomId, undefined, 3);
      expect(tail.map((m) => m.text)).toEqual(["m5", "m6", "m7"]);

      // Cursor: the `limit` messages immediately before seq 5.
      const older = await store.getMessagesBefore(roomId, 5, 3);
      expect(older.map((m) => m.text)).toEqual(["m2", "m3", "m4"]);

      // Fewer remain than `limit`: return what exists.
      expect((await store.getMessagesBefore(roomId, 2, 3)).map((m) => m.text)).toEqual(["m1"]);
      expect(await store.getMessagesBefore(roomId, 1, 3)).toEqual([]);
    });

    it("throws RoomNotFoundError when paging an unknown Room", async () => {
      const store = makeStore(await freshPath());
      await expect(store.getMessagesBefore("r_nope", undefined, 5)).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });

    it("lists all Rooms, oldest first", async () => {
      const store = makeStore(await freshPath());
      expect(await store.listRooms()).toEqual([]);
      const a = await store.createRoom("first", "alice");
      await new Promise((r) => setTimeout(r, 2)); // distinct createdAt for a real order check
      const b = await store.createRoom("second", "bob");
      const listed = await store.listRooms();
      expect(listed.map((r) => r.roomId)).toEqual([a.roomId, b.roomId]);
      expect(listed[1]).toMatchObject({ name: "second", members: ["bob"] });
    });

    it("persists across a fresh store instance at the same path", async () => {
      const path = await freshPath();
      const first = makeStore(path);
      const { roomId } = await first.createRoom("planning", "alice");
      await first.appendMessage(roomId, "alice", "one");
      await first.appendMessage(roomId, "alice", "two");
      (first as { close?: () => void }).close?.();

      const reopened = makeStore(path);
      const next = await reopened.appendMessage(roomId, "alice", "three");
      expect(next.seq).toBe(3);
      expect((await reopened.getMessages(roomId)).map((m) => m.text)).toEqual([
        "one",
        "two",
        "three",
      ]);
    });
  });
}
