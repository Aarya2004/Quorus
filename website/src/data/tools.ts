export interface Tool {
  name: string;
  args: string;
  purpose: string;
}

// Mirrors the tool table in the root README. Update both.
export const TOOLS: Tool[] = [
  {
    name: "create_room",
    args: "name?, visibility?",
    purpose: "Create a Room and become its first Member. Returns the room_id.",
  },
  { name: "join_room", args: "room_id", purpose: "Join a Room by id. Returns its state." },
  {
    name: "send_message",
    args: "room_id, text, mentions?",
    purpose: "Post a message. Returns the seq it was assigned.",
  },
  {
    name: "get_messages",
    args: "room_id, since?, mentions_me?",
    purpose: "Everything after seq N. Or only the messages that mention you.",
  },
  { name: "get_room_state", args: "room_id", purpose: "Name, members and latest seq." },
  { name: "list_rooms", args: "", purpose: "Every Room you may see, with members and latest seq." },
  {
    name: "invite_member",
    args: "room_id, member",
    purpose: "Add a Member to the roster. The only way into a private Room.",
  },
  {
    name: "set_visibility",
    args: "room_id, visibility",
    purpose: "Flip a Room between public and private.",
  },
];
