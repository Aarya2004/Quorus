import "../suppress-warnings"; // must precede node:sqlite to silence its load-time warning
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { RoomNotFoundError, type RoomRecord, type StoredMessage } from "../domain/types";
import type { Store } from "./store";

interface RoomRow {
  name: string;
  created_at: number;
}
interface MessageRow {
  seq: number;
  from_member: string;
  text: string;
  ts: number;
}

/**
 * SQLite-backed Store using Node's built-in `node:sqlite` (no native addon).
 *
 * A drop-in replacement for JsonlStore behind the same interface. The driver is
 * synchronous and single-connection, so each operation runs to completion before
 * the next — `seq` stays strictly monotonic without an explicit lock.
 */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        room_id   TEXT NOT NULL,
        member    TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, member),
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        room_id     TEXT NOT NULL,
        seq         INTEGER NOT NULL,
        from_member TEXT NOT NULL,
        text        TEXT NOT NULL,
        ts          INTEGER NOT NULL,
        PRIMARY KEY (room_id, seq),
        FOREIGN KEY (room_id) REFERENCES rooms(room_id)
      );
    `);
  }

  private membersOf(roomId: string): string[] {
    const rows = this.db
      .prepare("SELECT member FROM members WHERE room_id = ? ORDER BY joined_at, rowid")
      .all(roomId) as unknown as { member: string }[];
    return rows.map((r) => r.member);
  }

  async createRoom(name: string, creator: string): Promise<RoomRecord> {
    const roomId = `r_${randomBytes(8).toString("hex")}`;
    const now = Date.now();
    this.db
      .prepare("INSERT INTO rooms (room_id, name, created_at) VALUES (?, ?, ?)")
      .run(roomId, name, now);
    this.db
      .prepare("INSERT INTO members (room_id, member, joined_at) VALUES (?, ?, ?)")
      .run(roomId, creator, now);
    return { roomId, name, members: [creator], createdAt: now };
  }

  async getRoom(roomId: string): Promise<RoomRecord | undefined> {
    const row = this.db
      .prepare("SELECT name, created_at FROM rooms WHERE room_id = ?")
      .get(roomId) as unknown as RoomRow | undefined;
    if (!row) return undefined;
    return { roomId, name: row.name, members: this.membersOf(roomId), createdAt: row.created_at };
  }

  async joinRoom(roomId: string, member: string): Promise<RoomRecord> {
    const row = this.db
      .prepare("SELECT name, created_at FROM rooms WHERE room_id = ?")
      .get(roomId) as unknown as RoomRow | undefined;
    if (!row) throw new RoomNotFoundError(roomId);
    this.db
      .prepare("INSERT OR IGNORE INTO members (room_id, member, joined_at) VALUES (?, ?, ?)")
      .run(roomId, member, Date.now());
    return { roomId, name: row.name, members: this.membersOf(roomId), createdAt: row.created_at };
  }

  async appendMessage(roomId: string, from: string, text: string): Promise<StoredMessage> {
    const exists = this.db.prepare("SELECT 1 FROM rooms WHERE room_id = ?").get(roomId);
    if (!exists) throw new RoomNotFoundError(roomId);
    const { max } = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS max FROM messages WHERE room_id = ?")
      .get(roomId) as unknown as { max: number };
    const seq = max + 1;
    const ts = Date.now();
    this.db
      .prepare("INSERT INTO messages (room_id, seq, from_member, text, ts) VALUES (?, ?, ?, ?, ?)")
      .run(roomId, seq, from, text, ts);
    return { seq, from, text, ts };
  }

  async getMessages(roomId: string, since = 0): Promise<StoredMessage[]> {
    const exists = this.db.prepare("SELECT 1 FROM rooms WHERE room_id = ?").get(roomId);
    if (!exists) throw new RoomNotFoundError(roomId);
    const rows = this.db
      .prepare(
        "SELECT seq, from_member, text, ts FROM messages WHERE room_id = ? AND seq > ? ORDER BY seq",
      )
      .all(roomId, since) as unknown as MessageRow[];
    return rows.map((r) => ({ seq: r.seq, from: r.from_member, text: r.text, ts: r.ts }));
  }

  /** Release the database handle. */
  close(): void {
    this.db.close();
  }
}
