import "../suppress-warnings"; // must precede node:sqlite to silence its load-time warning
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  RoomNotFoundError,
  type RoomRecord,
  type StoredMessage,
  type Visibility,
} from "../domain/types";
import type { Store } from "./store";

interface RoomRow {
  name: string;
  visibility: Visibility;
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
        visibility TEXT NOT NULL DEFAULT 'public',
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
      CREATE TABLE IF NOT EXISTS message_mentions (
        room_id TEXT NOT NULL,
        seq     INTEGER NOT NULL,
        member  TEXT NOT NULL,
        PRIMARY KEY (room_id, seq, member)
      );
      CREATE INDEX IF NOT EXISTS idx_message_mentions_member
        ON message_mentions (room_id, member, seq);
    `);
    // Pre-0009 databases lack the visibility column; existing Rooms stay public.
    const cols = this.db.prepare("PRAGMA table_info(rooms)").all() as unknown as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "visibility")) {
      this.db.exec("ALTER TABLE rooms ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';");
    }
  }

  private membersOf(roomId: string): string[] {
    const rows = this.db
      .prepare("SELECT member FROM members WHERE room_id = ? ORDER BY joined_at, rowid")
      .all(roomId) as unknown as { member: string }[];
    return rows.map((r) => r.member);
  }

  private toRecord(roomId: string, row: RoomRow): RoomRecord {
    return {
      roomId,
      name: row.name,
      members: this.membersOf(roomId),
      visibility: row.visibility,
      createdAt: row.created_at,
    };
  }

  async createRoom(
    name: string,
    creator: string,
    visibility: Visibility = "public",
  ): Promise<RoomRecord> {
    const roomId = `r_${randomBytes(8).toString("hex")}`;
    const now = Date.now();
    this.db
      .prepare("INSERT INTO rooms (room_id, name, visibility, created_at) VALUES (?, ?, ?, ?)")
      .run(roomId, name, visibility, now);
    this.db
      .prepare("INSERT INTO members (room_id, member, joined_at) VALUES (?, ?, ?)")
      .run(roomId, creator, now);
    return { roomId, name, members: [creator], visibility, createdAt: now };
  }

  async getRoom(roomId: string): Promise<RoomRecord | undefined> {
    const row = this.db
      .prepare("SELECT name, visibility, created_at FROM rooms WHERE room_id = ?")
      .get(roomId) as unknown as RoomRow | undefined;
    return row ? this.toRecord(roomId, row) : undefined;
  }

  async joinRoom(roomId: string, member: string): Promise<RoomRecord> {
    const row = this.db
      .prepare("SELECT name, visibility, created_at FROM rooms WHERE room_id = ?")
      .get(roomId) as unknown as RoomRow | undefined;
    if (!row) throw new RoomNotFoundError(roomId);
    this.db
      .prepare("INSERT OR IGNORE INTO members (room_id, member, joined_at) VALUES (?, ?, ?)")
      .run(roomId, member, Date.now());
    return this.toRecord(roomId, row);
  }

  async setVisibility(roomId: string, visibility: Visibility): Promise<RoomRecord> {
    const changed = this.db
      .prepare("UPDATE rooms SET visibility = ? WHERE room_id = ?")
      .run(visibility, roomId);
    if (changed.changes === 0) throw new RoomNotFoundError(roomId);
    const row = this.db
      .prepare("SELECT name, visibility, created_at FROM rooms WHERE room_id = ?")
      .get(roomId) as unknown as RoomRow;
    return this.toRecord(roomId, row);
  }

  async appendMessage(
    roomId: string,
    from: string,
    text: string,
    mentions?: string[],
  ): Promise<StoredMessage> {
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
    const normalizedMentions = mentions?.length ? [...new Set(mentions)] : undefined;
    if (normalizedMentions) {
      const insertMention = this.db.prepare(
        "INSERT INTO message_mentions (room_id, seq, member) VALUES (?, ?, ?)",
      );
      for (const member of normalizedMentions) insertMention.run(roomId, seq, member);
    }
    return { seq, from, text, ...(normalizedMentions && { mentions: normalizedMentions }), ts };
  }

  private toMessage(roomId: string, row: MessageRow): StoredMessage {
    const mentions = this.db
      .prepare("SELECT member FROM message_mentions WHERE room_id = ? AND seq = ? ORDER BY rowid")
      .all(roomId, row.seq) as unknown as { member: string }[];
    return {
      seq: row.seq,
      from: row.from_member,
      text: row.text,
      ...(mentions.length && { mentions: mentions.map((mention) => mention.member) }),
      ts: row.ts,
    };
  }

  async getMessages(roomId: string, since = 0, mentioning?: string): Promise<StoredMessage[]> {
    const exists = this.db.prepare("SELECT 1 FROM rooms WHERE room_id = ?").get(roomId);
    if (!exists) throw new RoomNotFoundError(roomId);
    const rows = (mentioning === undefined
      ? this.db
          .prepare(
            "SELECT seq, from_member, text, ts FROM messages WHERE room_id = ? AND seq > ? ORDER BY seq",
          )
          .all(roomId, since)
      : this.db
          .prepare(
            `SELECT m.seq, m.from_member, m.text, m.ts
             FROM message_mentions mm
             JOIN messages m ON m.room_id = mm.room_id AND m.seq = mm.seq
             WHERE mm.room_id = ? AND mm.member = ? AND mm.seq > ?
             ORDER BY mm.seq`,
          )
          .all(roomId, mentioning, since)) as unknown as MessageRow[];
    return rows.map((row) => this.toMessage(roomId, row));
  }

  async getMessagesBefore(
    roomId: string,
    before: number | undefined,
    limit: number,
  ): Promise<StoredMessage[]> {
    const exists = this.db.prepare("SELECT 1 FROM rooms WHERE room_id = ?").get(roomId);
    if (!exists) throw new RoomNotFoundError(roomId);
    const rows = this.db
      .prepare(
        "SELECT seq, from_member, text, ts FROM messages WHERE room_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
      )
      .all(roomId, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as MessageRow[];
    return rows.reverse().map((row) => this.toMessage(roomId, row));
  }

  async listRooms(): Promise<RoomRecord[]> {
    const rows = this.db
      .prepare("SELECT room_id, name, visibility, created_at FROM rooms ORDER BY created_at, rowid")
      .all() as unknown as ({ room_id: string } & RoomRow)[];
    return rows.map((r) => this.toRecord(r.room_id, r));
  }

  /** Release the database handle. */
  close(): void {
    this.db.close();
  }
}
