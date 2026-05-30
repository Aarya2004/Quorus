import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
