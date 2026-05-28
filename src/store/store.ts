import type { RoomRecord, StoredMessage } from "../domain/types";

/**
 * Persistence seam for Quorus.
 *
 * Iteration 0 ships a JSONL-file implementation. Later iterations swap in
 * SQLite / Redis behind this same interface without touching the MCP layer.
 *
 * Implementations must keep `seq` strictly monotonic per Room, even under
 * concurrent `appendMessage` calls.
 */
export interface Store {
  /** Create a Room with `creator` as its first Member. Returns the new record. */
  createRoom(name: string, creator: string): Promise<RoomRecord>;

  /** Fetch a Room, or `undefined` if it does not exist. */
  getRoom(roomId: string): Promise<RoomRecord | undefined>;

  /** Add `member` to a Room's roster (idempotent). Throws if the Room is unknown. */
  joinRoom(roomId: string, member: string): Promise<RoomRecord>;

  /** Append a Message, assigning the next `seq`. Throws if the Room is unknown. */
  appendMessage(roomId: string, from: string, text: string): Promise<StoredMessage>;

  /** Messages with `seq > since` (default 0 = all). Throws if the Room is unknown. */
  getMessages(roomId: string, since?: number): Promise<StoredMessage[]>;
}
