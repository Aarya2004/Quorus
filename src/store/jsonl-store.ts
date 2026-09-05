import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RoomNotFoundError,
  type RoomRecord,
  type StoredMessage,
  type Visibility,
} from "../domain/types";
import { log } from "../log";
import type { Store } from "./store";

/**
 * Append-only, file-backed Store. Each Room lives in its own directory:
 *
 *   <baseDir>/<roomId>/meta.json        — name, members, createdAt
 *   <baseDir>/<roomId>/messages.jsonl   — one JSON Message per line
 *
 * Appends are the dumb-correct primitive: nothing is rewritten, so a concurrent
 * send can't clobber another's write. Writes to a single Room are serialized
 * through an in-process queue so `seq` stays strictly monotonic and lines never
 * interleave. (Cross-process safety is a later, store-backed iteration.)
 */
export class JsonlStore implements Store {
  /** Per-Room promise chain. Serializes writes to one Room. */
  private readonly locks = new Map<string, Promise<unknown>>();
  /** Cached latest seq per Room, so appends don't re-scan the log each time. */
  private readonly seqCache = new Map<string, number>();

  constructor(private readonly baseDir: string) {}

  private roomDir(roomId: string): string {
    return join(this.baseDir, roomId);
  }
  private metaPath(roomId: string): string {
    return join(this.roomDir(roomId), "meta.json");
  }
  private logPath(roomId: string): string {
    return join(this.roomDir(roomId), "messages.jsonl");
  }

  /** Run `fn` after any in-flight write to `roomId` completes. */
  private withLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(roomId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    // Keep the chain alive but swallow rejections so one failure doesn't poison it.
    this.locks.set(
      roomId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async readMeta(roomId: string): Promise<RoomRecord | undefined> {
    try {
      const raw = await readFile(this.metaPath(roomId), "utf8");
      // Pre-0009 meta files lack visibility; existing Rooms stay public.
      const meta = JSON.parse(raw) as Omit<RoomRecord, "visibility"> & { visibility?: Visibility };
      return { ...meta, visibility: meta.visibility ?? "public" };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  /** Atomic-ish meta write: write a temp file then rename over the target. */
  private async writeMeta(meta: RoomRecord): Promise<void> {
    const dir = this.roomDir(meta.roomId);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `meta.json.${randomBytes(4).toString("hex")}.tmp`);
    await writeFile(tmp, JSON.stringify(meta), "utf8");
    await rename(tmp, this.metaPath(meta.roomId));
  }

  private async loadLatestSeq(roomId: string): Promise<number> {
    const cached = this.seqCache.get(roomId);
    if (cached !== undefined) return cached;

    let seq = 0;
    try {
      const raw = await readFile(this.logPath(roomId), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as StoredMessage;
          if (typeof msg.seq === "number") seq = Math.max(seq, msg.seq);
        } catch {
          // Skip malformed lines (e.g. a partial write from a crash).
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    this.seqCache.set(roomId, seq);
    return seq;
  }

  async createRoom(
    name: string,
    creator: string,
    visibility: Visibility = "public",
  ): Promise<RoomRecord> {
    const roomId = `r_${randomBytes(8).toString("hex")}`;
    const meta: RoomRecord = {
      roomId,
      name,
      members: [creator],
      visibility,
      createdAt: Date.now(),
    };
    await this.writeMeta(meta);
    this.seqCache.set(roomId, 0);
    return { ...meta, members: [...meta.members] };
  }

  async setVisibility(roomId: string, visibility: Visibility): Promise<RoomRecord> {
    return this.withLock(roomId, async () => {
      const meta = await this.readMeta(roomId);
      if (!meta) throw new RoomNotFoundError(roomId);
      if (meta.visibility !== visibility) {
        meta.visibility = visibility;
        await this.writeMeta(meta);
      }
      return { ...meta, members: [...meta.members] };
    });
  }

  async getRoom(roomId: string): Promise<RoomRecord | undefined> {
    const meta = await this.readMeta(roomId);
    return meta ? { ...meta, members: [...meta.members] } : undefined;
  }

  async joinRoom(roomId: string, member: string): Promise<RoomRecord> {
    return this.withLock(roomId, async () => {
      const meta = await this.readMeta(roomId);
      if (!meta) throw new RoomNotFoundError(roomId);
      if (!meta.members.includes(member)) {
        meta.members.push(member);
        await this.writeMeta(meta);
      }
      return { ...meta, members: [...meta.members] };
    });
  }

  async appendMessage(
    roomId: string,
    from: string,
    text: string,
    mentions?: string[],
  ): Promise<StoredMessage> {
    return this.withLock(roomId, async () => {
      const meta = await this.readMeta(roomId);
      if (!meta) throw new RoomNotFoundError(roomId);
      const last = await this.loadLatestSeq(roomId);
      const normalizedMentions = mentions?.length ? [...new Set(mentions)] : undefined;
      const msg: StoredMessage = {
        seq: last + 1,
        from,
        text,
        ...(normalizedMentions && { mentions: normalizedMentions }),
        ts: Date.now(),
      };
      await mkdir(this.roomDir(roomId), { recursive: true });
      await appendFile(this.logPath(roomId), `${JSON.stringify(msg)}\n`, "utf8");
      this.seqCache.set(roomId, msg.seq);
      return msg;
    });
  }

  async getMessages(roomId: string, since = 0, mentioning?: string): Promise<StoredMessage[]> {
    const meta = await this.readMeta(roomId);
    if (!meta) throw new RoomNotFoundError(roomId);

    let raw: string;
    try {
      raw = await readFile(this.logPath(roomId), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const out: StoredMessage[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as StoredMessage;
        const mentions = parsed.mentions?.length ? parsed.mentions : undefined;
        const msg = { ...parsed, mentions };
        if (mentions === undefined) delete msg.mentions;
        if (
          typeof msg.seq === "number" &&
          msg.seq > since &&
          (mentioning === undefined || msg.mentions?.includes(mentioning))
        ) {
          out.push(msg);
        }
      } catch {
        // Skip malformed lines rather than failing the whole read, but record
        // it — a corrupt line is silent data loss worth seeing in the logs.
        log.warn("jsonl.skip-malformed-line", { room: roomId });
      }
    }
    return out;
  }

  async getMessagesBefore(
    roomId: string,
    before: number | undefined,
    limit: number,
  ): Promise<StoredMessage[]> {
    // The dev store just scans the full log; the page is a slice of it.
    const all = await this.getMessages(roomId, 0);
    const upTo = before === undefined ? all : all.filter((m) => m.seq < before);
    return upTo.slice(-limit);
  }

  async listRooms(): Promise<RoomRecord[]> {
    let entries: string[];
    try {
      entries = await readdir(this.baseDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const rooms: RoomRecord[] = [];
    for (const entry of entries) {
      const meta = await this.readMeta(entry);
      if (meta) rooms.push({ ...meta, members: [...meta.members] });
    }
    // roomId tiebreak keeps the order deterministic when two Rooms share a ms.
    return rooms.sort((a, b) => a.createdAt - b.createdAt || a.roomId.localeCompare(b.roomId));
  }
}
