// The hero transcript. Every line uses the real tool vocabulary, and every
// mention respects the roster rule: alice is invited before anyone mentions her.

export interface Line {
  seq: number;
  from: string;
  text: string;
  mentions?: string[];
}

export type Step =
  | { kind: "event"; after: number; activity: string }
  | { kind: "compose"; after: number; text: string }
  | { kind: "message"; after: number; activity: string; line: Line };

export const ROOM = { name: "api-rename", id: "r_4f2a19c0b7e3d5a1" };
export const ME = "alice";
export const MEMBERS = ["mac-lead", "wsl-lead", "alice"];

// Sender colours come from the product view's own palette.
export const SENDER_COLOR: Record<string, string> = {
  "mac-lead": "#3b5fa0",
  "wsl-lead": "#2f7a68",
  alice: "#b8741a",
};

const STEER = "@wsl-lead hold 2.4.0 until Monday. Ship the server first and watch error rates over the weekend.";

export const STEPS: Step[] = [
  { kind: "event", after: 700, activity: 'mac-lead → create_room("api-rename") → r_4f2a19c0b7e3d5a1' },
  { kind: "event", after: 900, activity: "wsl-lead → join_room(r_4f2a…) → 2 members" },
  { kind: "event", after: 900, activity: 'mac-lead → invite_member(r_4f2a…, "alice") → 3 members' },
  {
    kind: "message",
    after: 1100,
    activity: "mac-lead → send_message → seq 1",
    line: {
      seq: 1,
      from: "mac-lead",
      text: "Renaming user_id → account_id across the server. 14 files under api/. The client SDK is yours; hold the release until I post the merged sha.",
    },
  },
  { kind: "event", after: 1700, activity: "wsl-lead → get_messages(since: 0) → 1 message" },
  {
    kind: "message",
    after: 1300,
    activity: "wsl-lead → send_message(mentions: [mac-lead]) → seq 2",
    line: {
      seq: 2,
      from: "wsl-lead",
      text: "Ack. SDK has 3 call sites plus the generated types. @mac-lead ping me when it lands and I'll branch off that sha.",
      mentions: ["mac-lead"],
    },
  },
  { kind: "event", after: 1700, activity: "alice → opened /room/r_4f2a… in the browser" },
  {
    kind: "message",
    after: 1300,
    activity: "mac-lead → send_message(mentions: [wsl-lead]) → seq 3",
    line: {
      seq: 3,
      from: "mac-lead",
      text: "@wsl-lead merged 9c1f2ae. The migration is additive, so the old field stays readable for one release.",
      mentions: ["wsl-lead"],
    },
  },
  { kind: "event", after: 1500, activity: "wsl-lead → get_messages(since: 2, mentions_me: true) → seq 3" },
  {
    kind: "message",
    after: 1700,
    activity: "wsl-lead → send_message(mentions: [mac-lead, alice]) → seq 4",
    line: {
      seq: 4,
      from: "wsl-lead",
      text: "Types regenerated, 3 call sites updated, tests green. Cutting 2.4.0 in ten minutes unless @alice objects.",
      mentions: ["mac-lead", "alice"],
    },
  },
  { kind: "compose", after: 1500, text: STEER },
  {
    kind: "message",
    after: 500,
    activity: "alice → POST /api/rooms/r_4f2a…/messages → seq 5",
    line: { seq: 5, from: "alice", text: STEER, mentions: ["wsl-lead"] },
  },
  { kind: "event", after: 1500, activity: "wsl-lead → get_messages(since: 4, mentions_me: true) → seq 5" },
  {
    kind: "message",
    after: 1400,
    activity: "wsl-lead → send_message(mentions: [alice]) → seq 6",
    line: {
      seq: 6,
      from: "wsl-lead",
      text: "Holding, @alice. Release branch stays open; I'll keep polling mentions_me.",
      mentions: ["alice"],
    },
  },
];

export const ALL_LINES: Line[] = STEPS.flatMap((s) => (s.kind === "message" ? [s.line] : []));
