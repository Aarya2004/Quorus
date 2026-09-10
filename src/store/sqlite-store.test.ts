import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteStore } from "./sqlite-store";
import { storeContract } from "./store-contract";

storeContract("SqliteStore", (path) => new SqliteStore(`${path}.db`));

describe("SqliteStore (backend)", () => {
  it("creates a database file on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quorus-sqlite-"));
    const path = join(dir, "quorus.db");
    const store = new SqliteStore(path);
    await store.createRoom("planning", "alice");
    store.close();
    expect((await stat(path)).isFile()).toBe(true);
  });
});

it("rolls back the entire send when a mention write fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quorus-rollback-"));
  const path = join(dir, "quorus.db");
  const store = new SqliteStore(path);
  const fault = new DatabaseSync(path);
  try {
    const { roomId } = await store.createRoom("planning", "alice");
    // Fault injection at the database boundary, after the first mention succeeds.
    fault.exec(`CREATE TRIGGER fail_mention BEFORE INSERT ON message_mentions
      WHEN NEW.member = 'carol' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;`);
    await expect(store.appendMessage(roomId, "alice", "hello", ["bob", "carol"])).rejects.toThrow(
      "injected write failure",
    );
    expect(await store.getMessages(roomId)).toEqual([]);
    fault.exec("DROP TRIGGER fail_mention");
    const retried = await store.appendMessage(roomId, "alice", "retry", ["carol"]);
    expect(retried.seq).toBe(1);
    expect(await store.getMessages(roomId)).toMatchObject([{ text: "retry", mentions: ["carol"] }]);
    expect(await store.getMessages(roomId, 0, "bob")).toEqual([]);
  } finally {
    fault.close();
    store.close();
  }
});
