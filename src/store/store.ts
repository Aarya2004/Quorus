import type { RoomRecord, StoredMessage, Visibility } from "../domain/types";

/**
 * Persistence seam for Quorus.
 *
 * SQLite (`node:sqlite`) is the server default; the append-only JSONL store is
 * the zero-config dev alternative. Both must pass the shared contract suite
 * (`store-contract.ts`), so persistence can change without touching the MCP layer.
 *
 * Implementations must keep `seq` strictly monotonic per Room, even under
 * concurrent `appendMessage` calls.
 */
export interface Store {
  /** Create a Room with `creator` as its first Member. Returns the new record. */
  createRoom(name: string, creator: string, visibility?: Visibility): Promise<RoomRecord>;

  /** Set a Room's Visibility (ADR 0009). Throws if the Room is unknown. */
  setVisibility(roomId: string, visibility: Visibility): Promise<RoomRecord>;

  /** Fetch a Room, or `undefined` if it does not exist. */
  getRoom(roomId: string): Promise<RoomRecord | undefined>;

  /** Add `member` to a Room's roster (idempotent). Throws if the Room is unknown. */
  joinRoom(roomId: string, member: string): Promise<RoomRecord>;

  /** Append a Message with optional mentions and the next `seq`. Throws for an unknown Room. */
  appendMessage(
    roomId: string,
    from: string,
    text: string,
    mentions?: string[],
  ): Promise<StoredMessage>;

  /** Messages after `since` (default 0), optionally mentioning a Member. Throws for unknown Rooms. */
  getMessages(roomId: string, since?: number, mentioning?: string): Promise<StoredMessage[]>;

  /**
   * Backward page for lazy history (ADR 0008): up to `limit` Messages with
   * `seq < before`, ascending; `before` undefined means the newest `limit`.
   * Throws if the Room is unknown.
   */
  getMessagesBefore(
    roomId: string,
    before: number | undefined,
    limit: number,
  ): Promise<StoredMessage[]>;

  /** All Rooms, oldest first. */
  listRooms(): Promise<RoomRecord[]>;
}
