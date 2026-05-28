// Core domain types for Quorus.
//
// A Room is a bounded coordination space identified by a stable `roomId`; its
// `name` is a human-facing label, not its identity. A Member is a named occupant
// (the `from` of every Message). A Message is ordered within its Room by a
// monotonic `seq`, which doubles as the catch-up cursor.

export const MAX_TEXT_LENGTH = 8000;
export const MAX_NAME_LENGTH = 100;

/** A single communication posted by a Member into a Room. */
export interface StoredMessage {
  /** Per-Room monotonic sequence number (1, 2, 3, …). Total order + cursor. */
  seq: number;
  /** The Member who sent it. */
  from: string;
  text: string;
  /** Unix epoch milliseconds. Display only — ordering comes from `seq`. */
  ts: number;
}

/** A Room and its membership roster. */
export interface RoomRecord {
  roomId: string;
  name: string;
  /** Membership: the Members that belong to this Room (recorded on join). */
  members: string[];
  createdAt: number;
}

/** Raised when an operation targets a Room that does not exist. */
export class RoomNotFoundError extends Error {
  constructor(public readonly roomId: string) {
    super(`Room not found: ${roomId}`);
    this.name = "RoomNotFoundError";
  }
}
