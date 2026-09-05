# Chat/room UI patterns for the human view redesign

**Date:** 2026-08-30
**Scope:** What chat-native room UIs actually do — message grouping/density, sender identity
without avatars, observer-vs-participant signaling, unread/catch-up, multi-agent
observability UIs, and citable community sentiment — as input to replacing the rejected
"listening post" design (ADR 0008 view; owner verdict: "too much like Warp"). Every claim
carries a source URL; claims that could not be pinned to a primary source are flagged
inline and collected at the end. Note: `support.discord.com` returns 403 to fetchers and
`help.twitch.tv` is an unrenderable SPA — claims for those rest on first-party blogs,
vendor-forum posts quoting product strings, or search excerpts of the official pages, as
flagged.

**Quorus constraints this research is filtered through:** rooms of 2–5 named members
(agents + occasionally 1 human), bursty cadence, technical prose with code, per-room
monotonic seq, no threads/reactions/avatars in the data model, watching is
roster-invisible, sending implicitly joins (ADR 0008), private rooms are roster-gated
(ADR 0009).

---

## 1. Message grouping & density

### Bubbles vs flat rows

The split in real products is clean: **workplace/community/technical chat is flat and
left-aligned** (Slack, Discord, Zulip, IRC clients, Linear comments), **personal
messaging is bubbles with own-messages on the right** (Telegram, WhatsApp, iMessage —
*flagged: universally observed, but no vendor publishes a written description of its
bubble layout*). No vendor publishes a "why we chose flat rows" rationale either; the
closest first-party reasoning is density — both Slack and Discord frame their compact
options as fitting more conversation on screen (below). Every product built for
multi-party technical reading chose flat rows: one reading column, with name labels
rather than side-alignment carrying identity.

### Slack — Clean vs Compact themes

Slack ships two message display themes: the default **Clean** theme "displays member
profile photos beside their messages"; the **Compact** theme "uses less white space
between messages and hides member profile photos"
([Change how messages are displayed — slack.com/help](https://slack.com/help/articles/213893898-Change-how-messages-are-displayed)).
Even Slack's density lever works by dropping avatars — the name + text row is the
load-bearing unit. Exact timestamps are on hover: "If you hover over any timestamp of a
message in Slack you'll get the exact timestamp and date"
([@SlackHQ](https://x.com/SlackHQ/status/1369314777579786240?lang=en) — first-party, but
a tweet). Slack visibly coalesces consecutive messages from one sender under a single
avatar/name header — *flagged: the grouping time window is documented nowhere official;
do not cite an N-minute figure for Slack.* Slack's formatting help lists "Code" and
"Code block" options and does **not** mention syntax highlighting
([Format your messages](https://slack.com/help/articles/202288908-Format-your-messages)).

### Discord — Cozy vs Compact

Discord's official blog documents the pair: Compact mode "forgoes avatars, decreases the
amount of spacing between messages, and even starts someone's message on the same line
as their display name" (IRC-style); a "Space Between Message Groups" slider works with
both modes; and inside Compact, "the option to 'Show user avatars' becomes available"
([Making Discord on Desktop Look Just Right — discord.com/blog](https://discord.com/blog/making-discord-on-desktop-look-just-right-display-settings-to-ease-the-eyes);
also [How do I switch to compact text mode — support.discord.com](https://support.discord.com/hc/en-us/articles/217047657-How-do-I-switch-to-compact-text-mode)).
In Cozy mode consecutive messages from one sender group under one name+timestamp header.
*Flagged: the grouping interval (7-minute gap; later changed to "8 minutes after the
first message") appears only in user posts on Discord's own support forum, not vendor
docs — [community post](https://support.discord.com/hc/en-us/community/posts/360048310712-Not-having-to-wait-to-make-your-message-separate),
[grouping-change complaint](https://support.discord.com/hc/en-us/community/posts/12799818806551-Undo-the-recent-change-to-message-grouping).*
Code: inline backticks, triple-backtick blocks, and language-tagged blocks for syntax
highlighting per the official
[Markdown Text 101](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline)
(*flagged: the highlight.js detail is from search excerpts of that article, fetch 403'd*).

### Zulip — conversations, recipient bars, one reading column

Zulip's structural bet: messages group by **conversation** ("a direct message thread…
or a topic in a channel"), and "threads appear in the main message view instead of a
sidebar, because threads help keep conversations organized, so Zulip puts them front and
center" ([Reading conversations — zulip.com/help](https://zulip.com/help/reading-conversations)).
Each message group carries a clickable **recipient bar** — "channel/topic or direct
message recipient list at the top of a group of messages"
([Unread counts and the pointer — zulip.readthedocs.io](https://zulip.readthedocs.io/en/stable/subsystems/pointer.html)).
The first-party rationale: "You can read Zulip one conversation at a time, seeing each
message in context, no matter how many other conversations are going on," and topics
"make it easy to pick up a conversation thread hours (or days!) later"
([zulip.com/why-zulip](https://zulip.com/why-zulip/)). Zulip also omits the sender
name/avatar on consecutive same-sender messages within a group (*flagged: observed;
sender-name typography work is tracked in
[zulip/zulip#22022](https://github.com/zulip/zulip/issues/22022), but no help page
describes coalescing*). Code blocks: fenced ``` blocks, "Tagging a code block with a
language enables syntax highlighting," org-default language configurable, in "a variant
of GitHub Flavored Markdown"
([Code blocks — zulip.com/help](https://zulip.com/help/code-blocks),
[Message formatting](https://zulip.com/help/format-your-message-using-markdown)).

For Quorus: a room *is* a conversation, so the recipient-bar idea maps not to topics but
to **burst boundaries** — the minutes-of-silence gaps between rapid exchanges are
natural group headers.

### IRC clients — the density ceiling

WeeChat's layout is columnar — "for each line: time, prefix (before '|'), message
(after '|')" ([WeeChat user's guide](https://weechat.org/files/doc/stable/weechat_user.en.html)).
Verified from WeeChat's source
([src/core/core-config.c](https://github.com/weechat/weechat/blob/main/src/core/core-config.c)):

- `weechat.look.prefix_align` — "prefix alignment (none, left, right (default))".
- `weechat.look.prefix_same_nick` — "prefix displayed for a message with same nick as
  previous but not next message: use a space \" \" to hide prefix…" — i.e. built-in
  same-sender coalescing predating Slack, leaving an aligned gutter.
- `weechat.look.buffer_time_format` — per-line timestamp column.

Textual (macOS IRC client) went further on identity: since 7.0.7, "Nicknames are now
assigned a consistent, unique color instead of picking from a pool of thirty
possibilities," computed as HSL adjusted to the style's light/dark window color, with
`/setcolor` overrides ([Textual KB: Migrating to 7.0.7](https://help.codeux.com/textual/release-notes/Style-Developers:-Migrating-to-7.0.7.kb)).

### Linear & Campsite comment feeds

Linear issues carry flat comment feeds with "threaded replies," where "resolving threads
clarifies when a question has been answered or a decision is made"
([Linear docs: Comments and reactions](https://linear.app/docs/comment-on-issues)) —
*flagged: the visual rendering (full-width rows, avatar+name+relative-timestamp header,
no bubbles) is observed product behavior; Linear publishes no spec of it.* Campsite's
first-party position is post-first: posts have "a title, a body, and threaded replies,"
framed against chat as the noisy path of least resistance — though "Post-first does not
mean anti-chat" ([campsite.com/blog](https://www.campsite.com/blog/post-first-does-not-mean-anti-chat);
[Posts are the sweet spot between chat and docs](https://www.campsite.com/blog/posts-are-the-sweet-spot-between-chat-and-docs)).

### Which choices suit Quorus

Dense technical multi-party chat consistently means: **flat left-aligned rows, coalesced
same-sender runs, boxed mono code inside proportional prose, timestamps de-emphasized to
gutter/hover, date and gap dividers**. Bubbles solve a 1:1 problem (whose turn is it)
that a 2–5-agent room does not have. Research-grade guidance is thin, but NN/g's chat
study supports the two essentials: "Show time stamps for messages to put response times
in the right perspective" and "Visually differentiate the messages coming from different
participants in the chat" ([NN/g: The User Experience of Customer-Service Chat](https://www.nngroup.com/articles/chat-ux/)
— note: studies 2-party support chat, not team chat).

---

## 2. Sender identity with no avatars

Quorus members are just names — exactly the regime IRC, Discord-compact, and Telegram
groups already solved.

### Deterministic name colors

- **Telegram** — two primary sources that differ, worth quoting precisely. The API spec:
  "If no palette is specified for a peer, a random color from red, orange, violet,
  green, cyan, blue, pink … must be chosen locally as message accent palette **once for
  every met peer**" ([Peer colors — core.telegram.org/api/colors](https://core.telegram.org/api/colors))
  — small curated palette (7 base colors), stable per peer once chosen. The classic
  client behavior is fully deterministic: Telegram Android's `AvatarDrawable.java`
  computes `getColorIndex(long id) { return (int) Math.abs(id % Theme.keys_avatar_background.length); }`
  and derives the in-message name color from it
  ([DrKLO/Telegram — AvatarDrawable.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Components/AvatarDrawable.java)).
  Either way: **hash/assign into a small hand-picked palette, never a continuous hue**.
- **Discord** colors usernames by role. Developer docs: the role `colors` object has
  primary/secondary/tertiary colors and "Roles without colors (`colors.primary_color == 0`)
  do not count towards the final computed color in the user list"; role `position`
  orders roles ([Discord developer docs: Permissions](https://docs.discord.com/developers/topics/permissions)).
  *Flagged: the user-facing "highest colored role wins" phrasing lives in the
  [Roles and Permissions support article](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions),
  which 403'd — corroborated only via the dev docs' computed-color language.* Takeaway:
  color can encode **kind** (role), not just individual — relevant if Quorus ever
  distinguishes orchestrators from workers or humans from agents.
- **WeeChat** hashes each nick into `weechat.color.chat_nick_colors` — "text color for
  nicks (comma separated list of colors…)" with a default 10-color list
  ([core-config.c](https://github.com/weechat/weechat/blob/main/src/core/core-config.c)).
  irssi's canonical `nickcolor.pl` does the same — `simple_hash` of the nick into a
  configurable color list, with saved per-nick overrides
  ([irssi/scripts.irssi.org — nickcolor.pl](https://github.com/irssi/scripts.irssi.org/blob/master/scripts/nickcolor.pl)).
  Textual assigns a consistent computed HSL color per nick, adjusted for light/dark
  ([Textual 7.0.7 notes](https://help.codeux.com/textual/release-notes/Style-Developers:-Migrating-to-7.0.7.kb)).
- **Zulip** does *not* color senders — confirmed by the open feature request to add name
  display colors, [zulip/zulip#36889](https://github.com/zulip/zulip/issues/36889);
  identity is carried by avatar + name weight
  ([typography spec issue #22022](https://github.com/zulip/zulip/issues/22022)).

Design lesson vs Quorus today: the current `hue()` helper (`page-client.ts`) hashes to a
**continuous** 0–360 hue, which yields adjacent, muddy, or low-contrast colors. Every
shipped system above uses a **small hand-picked palette** (7–10 entries) with contrast
guaranteed against the background, assigned by hash. That is the fix, not more hue math.

### Initial/generated avatars

Where products need a visual anchor without uploaded images, the standard is a
deterministic generated mark:

- GitHub **identicons**: "simple 5×5 'pixel' sprites that are generated using a hash of
  the user's ID," the default avatar "for anyone without a Gravatar"
  ([github.blog: Identicons!](https://github.blog/news-insights/company-news/identicons/)).
- Gravatar's default-image options include `identicon` ("a geometric pattern based on an
  email hash") and `initials` ("uses the profile name as initials, with a generated
  background and foreground color")
  ([Gravatar developer docs: Avatars](https://docs.gravatar.com/sdk/images/)).
- **boring-avatars** "generates unique SVG-based user profile avatars from usernames" —
  same input → identical SVG, six variants
  ([boringdesigners/boring-avatars — GitHub](https://github.com/boringdesigners/boring-avatars)).
- *Flagged: Google Contacts' colored-initial circles have no official Google doc.*

The cheapest credible variant for Quorus: a colored initial chip (first letter of the
member name on the member's palette color) — zero data-model change, a scannable left
anchor for rows.

### Alignment

All-left is the norm across every multi-party product surveyed (Slack, Discord, Zulip,
IRC, Linear); mine-right belongs to 1:1 bubble UIs. *Flagged: no vendor states this
rationale; it is convention plus fit.* For Quorus there is an extra argument: the human
is primarily an **observer**, and mine-right layout would visually center the human's
rare steering messages as if the room were about them. Keep everything left; mark "you"
on the name label, not with geometry.

---

## 3. Observer vs participant signaling

The cross-product pattern: **reading is free; the composer slot is where participation
state lives.** No product hides readable content behind the gate — the gate is rendered
where the input would be, and the best implementations say *what* is required.

- **Slack**: preview-then-join is first-party — "with one click, you can preview or join
  the channels that interest you"
  ([Introducing channel search — slack.com/blog](https://slack.com/blog/productivity/introducing-channel-search-for-slack));
  the help flow is browse → "Select a channel from the list to view it" → **Join
  Channel**, including temporary joins ("Just for today / For 48 hours / For 1 week")
  ([Join a channel — slack.com/help](https://slack.com/help/articles/205239967-Join-a-channel)).
  Join is always an explicit click. *Flagged: the preview bar's exact copy ("You are
  viewing #…" with Join Channel replacing the composer) is observed behavior — no
  current help article documents the preview surface.*
- **Discord**: read-only channels keep the transcript fully visible; official docs for
  role-exclusive announcement channels: members with the role "are the only people who
  are able to send messages in this channel. Everyone else will have read-only access"
  ([support.discord.com article](https://support.discord.com/hc/en-us/articles/205369668-How-do-I-set-up-a-Role-Exclusive-announcements-channel),
  via search excerpt — fetch 403'd). The composer becomes a disabled bar reading
  verbatim **"You do not have permission to send messages in this channel."** —
  confirmed via feature-request posts on Discord's own forum asking to customize it,
  which also document that the fixed, non-explanatory copy is a real UX pain point
  ([customize-the-message request](https://support.discord.com/hc/en-us/community/posts/360049334493-Be-able-change-the-You-do-not-have-permission-to-send-messages-in-this-channel-message),
  [explain-why request](https://support.discord.com/hc/en-us/community/posts/1500001167762-Allow-for-a-custom-message-to-explain-why-a-user-does-not-have-permission-to-post)).
- **Zulip** decomposes this differently — the most interesting counter-model. Reading
  never requires subscribing: non-guests can "see all messages and topics, whether or
  not they are subscribed" in public channels
  ([Channel permissions — zulip.com/help](https://zulip.com/help/channel-permissions)),
  and "There's no need to subscribe to channels where you don't plan to read the
  conversations" ([Introduction to channels](https://zulip.com/help/introduction-to-channels)).
  **Web-public channels** go further: "Logged out visitors can browse all content…
  including using Zulip's built-in search"; they cannot send or react, and non-public
  channels are invisible to them
  ([Public access option](https://zulip.com/help/public-access-option)).
  Crucially, *sending doesn't force joining either*: you can post to an unsubscribed
  public channel; Zulip deliberately replaced a blocking "not subscribed" error with a
  **non-blocking compose-box warning banner** (you won't be notified of replies)
  ([zulip/zulip#16751](https://github.com/zulip/zulip/issues/16751)); posting rights are
  governed by channel posting policy, not subscription
  ([Channel posting policy](https://zulip.com/help/channel-posting-policy)). In Zulip,
  subscription is a *notification/tracking* concern, not a permission concern.
- **Twitch**: watching is always free; chat gates by mode — "Followers-Only Mode
  restricts chat to only include viewers who have followed you for a specific amount of
  time" ([Twitch blog, 2017](https://blog.twitch.tv/en/2017/01/26/your-chat-has-been-upgraded-with-followers-only-mode-e2031707ab4c/));
  subscriber-only via `/subscribers`
  ([Subscriber Streams — help.twitch.tv](https://help.twitch.tv/s/article/subscriber-streams?language=en_US),
  search excerpt; the canonical [Chat Basics](https://help.twitch.tv/s/article/chat-basics)
  page would not render). *Flagged: the logged-out "Log in to Chat" button and
  in-input mode notices are observed behavior only.*
- **YouTube live chat**: watching requires nothing; "All signed-in users can chat," with
  the participant setting choosing Anyone / Subscribers only / Members only
  ([Use Live Chat — support.google.com/youtube](https://support.google.com/youtube/answer/2524549),
  partially via search excerpts); members-only and subscribers-only chat and slow mode
  are creator-configurable
  ([Moderate live chat](https://support.google.com/youtube/answer/9826490?hl=en)).
  *Flagged: exact logged-out composer copy undocumented.*

**Implications for Quorus's send-joins model (ADR 0008).** Implicit join-on-send exists
nowhere in these products — Slack requires an explicit click, Twitch/YouTube an explicit
follow/sign-in, and Zulip decouples sending from joining entirely. Two consequences:

1. Because the convention is unfamiliar, the composer must *say it before the fact* —
   in the same slot where Discord puts its permission string and Slack its Join bar:
   e.g. placeholder/label reading "watching · sending will add you to this room's
   roster." Zulip's non-blocking compose warning banner (#16751) is the exact
   interaction pattern to copy for this notice.
2. Discord's fixed "You do not have permission…" complaints show the copy must state
   *what* gates sending. For private rooms (ADR 0009), a non-roster viewer never sees
   the room at all — but the join-notice copy still matters for public rooms.

Since watching is deliberately roster-invisible, "watching" state belongs to the
*viewer's* chrome (connection status in the header), never to the roster.

---

## 4. Unread / catch-up

### Zulip (the strongest model)

- Per-message read state: "Zulip automatically keeps track of which messages you have
  and haven't read"; "Unread messages have a line along the left side, which fades when
  the message gets marked as read"; auto-mark-on-scroll is configurable — Always
  ("marked as read whenever you scroll through them") / Only in conversation views /
  Never ([Marking messages as read — zulip.com/help](https://zulip.com/help/marking-messages-as-read)).
- Catch-up is conversation-first: "it generally works best to read your messages
  organized by conversation"; the **Inbox** lists conversations with unreads; **Recent
  conversations** is "particularly useful for catching up on messages sent while you
  were away," with a Participated filter; keyboard **N** = next unread topic, **P** =
  next unread DM ([Reading strategies](https://zulip.com/help/reading-strategies)).
- First-party framing ties this to async work: "Rather than task-switching each time a
  new message comes in, you can focus on your work for a few hours, and then follow up
  asynchronously"; unthreaded chat forces you to "scroll up and down through dozens of
  messages to track down all parts of a conversation"
  ([zulip.com/why-zulip](https://zulip.com/why-zulip/) — first-party marketing; the
  mechanisms are backed by the help pages above).
- *Flagged: the in-pane blue "N unread messages" banner exists in-product but its copy
  is not documented in the help center.*

### Slack

- Sidebar-level unread signal: "A **bold** channel or DM in the sidebar… means there are
  unread messages," plus a dedicated **Unreads** view
  ([Send and read messages — slack.com/help](https://slack.com/help/articles/201457107-Send-and-read-messages)).
- On opening a channel, three documented behaviors: "Start where you left off and mark
  the conversation as read" (default), "Start at the newest message and mark the
  conversation as read," "Start at the newest message but leave the unseen messages
  unread" ([Manage your Mark as Read preference](https://slack.com/help/articles/360043037853-Manage-your-Mark-as-Read-preference)).
- Keyboard: **Esc** marks the conversation read; **Shift+Esc** marks everything read;
  Option/Alt+Click marks a message unread; Unreads view has "Mark All Messages Read"
  with Undo ([View all your unread messages](https://slack.com/help/articles/226410907-View-all-your-unread-messages);
  [Slack keyboard shortcuts](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts)).
- *Flagged: the famous red "New messages" divider line and "X new messages" jump pill
  are documented in no current help article — observed behavior only.*

### Discord

- The **Inbox** aggregates unreads with "Mark Inbox As Read"; white pills beside server
  icons mark unread servers ([Inbox FAQ — support.discord.com](https://support.discord.com/hc/en-us/articles/360045027712-Inbox-FAQ),
  via search excerpt — fetch 403'd). Right-click mark-as-unread / mark-server-read
  exist ([Flag message as unread — forum](https://support.discord.com/hc/en-us/community/posts/360042587611-Flag-message-as-unread)).
- The floating "Y new messages since HH:MM" bar at the top of a channel with dismiss/
  mark-read is described in user posts on Discord's own forum
  ([Marking channel read iOS](https://support.discord.com/hc/en-us/community/posts/19874295797911-Marking-channel-read-iOS)).
  *Flagged: the exact "NEW MESSAGES — Mark As Read" copy and in-list red divider are not
  vendor-documented.*

### What's praised for returning to a busy room

Zulip's catch-up model is the one with named endorsements: "When I come back after a
break, I don't feel overwhelmed: I can skim topics looking for the ones that seem
important" — Niko Matsakis, Rust language team co-lead
([Zulip Rust case study](https://zulip.com/case-studies/rust/)); "a busy channel works
just fine in Zulip" ([why-zulip](https://zulip.com/why-zulip/)). See § 6 for more.

### Live-tail conventions

"Pinned to bottom while at bottom; scrolling up unpins; show a jump-to-latest
affordance" is documented primarily in chat-SDK vendor docs, not neutral design systems:

- Stream Chat React: "By default, the VirtualizedMessageList will scroll down to display
  new messages," with the caveat that smooth scrolling "can be unwieldy in chats with
  more than 2-3 incoming messages per second"
  ([VirtualizedMessageList — getstream.io docs](https://getstream.io/chat/docs/sdk/react/components/core-components/virtualized_list/);
  [Livestream best practices](https://getstream.io/chat/docs/sdk/react/guides/livestream-setup/)).
  React Native ships a dedicated `ScrollToBottomButton` — "a floating button which when
  pressed scrolls the MessageList to the most recent message"
  ([docs](https://getstream.io/chat/docs/sdk/react-native/ui-components/scroll-to-bottom-button/)).
- Sendbird UIKit adds a refinement for tall messages: when an incoming message is taller
  than the viewport, "the scroll position no longer auto-jumps to the bottom, and
  instead the view scrolls to the top of the new message"
  ([sendbird-uikit-react CHANGELOG](https://github.com/sendbird/sendbird-uikit-react/blob/main/CHANGELOG.md)).
- *Flagged: no major public design system (Material, Carbon, …) documents this pattern.*

Quorus already implements the base pattern (`page-client.ts` `atBottom`/`newchip`);
Sendbird's tall-message rule is worth adopting since agent messages are often long.

**For Quorus:** the seq column is a gift here — "last seen seq" per viewer (localStorage
is enough; watching must stay server-invisible) buys a Slack-style unread divider
("— new since seq 0142 —") and a Zulip-style left-edge unread line with no data-model
change. For bursty rooms, the divider plus gap-headers is the catch-up story: "you were
away; two exchanges happened; start here."

---

## 5. Multi-agent observability chat UIs

What agent-conversation UIs add on top of plain chat, verified against their docs:

- **Devin (Cognition)**: chat pane + workspace tabs — a **Progress tab** consolidating
  "shell commands, code edits, and browser activity" into one unified view (click any
  step to inspect), Shell with a jumpable command timeline, IDE, Desktop; plus
  **side chats** — read-only question threads "in a panel next to the worklog" so a
  human can interrogate a session *without interrupting the agent*
  ([Devin Session Tools — docs.devin.ai](https://docs.devin.ai/work-with-devin/devin-session-tools)).
  *Flagged: the launch-era "Planner" tab name is not on current docs.*
- **AutoGen Studio (Microsoft)**: live message streaming between agents, a "control
  transition graph" of message flow, and run control
  ([AutoGen Studio user guide — microsoft.github.io/autogen](https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/index.html));
  the paper adds an "observe message" drill-down (duration, tokens, tool use + status,
  cost per run) and a per-agent profiler
  ([AutoGen Studio — arXiv:2408.15247](https://arxiv.org/html/2408.15247)).
  Its top user complaints are about **hidden inner messages**: thought events not
  reaching the UI ([microsoft/autogen#6959](https://github.com/microsoft/autogen/issues/6959)),
  agent requests "not bubbled up to the UI"
  ([#1664](https://github.com/microsoft/autogen/issues/1664)) — losing messages breaks
  users' ability to follow a run.
- **LangGraph Studio (LangChain)**: graph visualization beside an interaction box, "a
  stream of real-time information about what steps are happening," step-through debug
  pausing, direct state editing, interrupt-anytime
  ([LangGraph Studio — langchain.com/blog](https://www.langchain.com/blog/langgraph-studio-the-first-agent-ide)).
  Current docs split the product into **Graph mode** (full step/state/time-travel) and
  **Chat mode** ("a simpler UI for iterating on and testing chat-specific agents") —
  explicit acknowledgment that the chat lens and the step lens are different views
  ([Studio — docs.langchain.com](https://docs.langchain.com/langgraph-platform/langgraph-studio)).
- **OpenAI Agents SDK Traces**: traces (workflow) of typed spans — agent, generation,
  function/tool, guardrail, and **handoff** spans — rendered in a hosted dashboard
  ([Tracing — openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/tracing/)).
- **Anthropic multi-agent research system**: "Adding full production tracing let us
  diagnose why agents failed and fix issues systematically"; they "monitor agent
  decision patterns and interaction structures — all without monitoring the contents of
  individual conversations"
  ([anthropic.com/engineering](https://www.anthropic.com/engineering/built-multi-agent-research-system)).
- **Langfuse** (supporting): nested typed observations, waterfall timeline, inferred
  agent graph ([langfuse.com/docs/observability/overview](https://langfuse.com/docs/observability/overview),
  [agent graphs](https://langfuse.com/docs/observability/features/agent-graphs)).

**Synthesis.** Over plain chat these add: (a) identity/role labels on every event,
(b) typed events rather than undifferentiated text, (c) collapsible drill-down from
message to detail, (d) timelines, (e) a second structural lens beside chat, and
(f) non-interrupting observation (Devin side chats). On legibility: transparency alone
does not guarantee comprehension — Answer.AI could "watch it work … in real time" and
still found "Devin would spend days pursuing impossible solutions"
([Thoughts On A Month With Devin — answer.ai](https://www.answer.ai/posts/2025-01-08-devin)).

**Restraint note for Quorus:** Quorus messages are plain text between peers — there are
no tool-call/step events in the data model. The transferable patterns are the *cheap*
ones: consistent per-agent identity, collapse-long-content, a timeline sense (seq +
gaps), and Devin-style "observe without interrupting" — not a trace tree the data
cannot support.

---

## 6. Community sentiment (citable only)

- **Zulip for async technical reading — praise with named sources.** Rust's teams
  (Compiler, Language, Library, Infrastructure) run on Zulip; the case study quotes
  David Wood ("In Zulip, I can instantly see the context for each message"), Matsakis
  (skim-topics-on-return, § 4), and Josh Triplett ("Slack and Discord feel opaque.
  Zulip feels like an open room.") ([zulip.com/case-studies/rust](https://zulip.com/case-studies/rust/)).
  The compiler team's own site: Zulip "makes it pleasant to have multiple conversations
  going on at once" and its "thread-based organization creates a clear record of past
  discussions" ([rust-lang.github.io/compiler-team](https://rust-lang.github.io/compiler-team/about/chat-platform/)).
  Migration context: [Mozilla IRC Sunset (blog.rust-lang.org, 2019)](https://blog.rust-lang.org/2019/04/26/Mozilla-IRC-Sunset-and-the-Rust-Channel/),
  [Library team moves to Zulip (internals.rust-lang.org)](https://internals.rust-lang.org/t/the-library-team-is-moving-from-irc-to-zulip/11598).
  Recurring HN threads: ["Why Zulip will stand the test of time"](https://news.ycombinator.com/item?id=29595926),
  ["Is anyone using Zulip…"](https://news.ycombinator.com/item?id=30480012),
  ["Zulip 3.0"](https://news.ycombinator.com/item?id=23860338),
  ["Our Slack is dead. Long live Zulip"](https://news.ycombinator.com/item?id=43942759)
  (*dates per search snippets, threads not individually read*).
- **Slack for deep work — the canonical complaint.** Abe Winter, "Slack is the opposite
  of organizational memory" (2018): Slack "destroys teams' ability to think, plan & get
  complex work out the door" and normalizes interruption
  ([abe-winter.github.io](https://abe-winter.github.io/plea's/help/2018/02/11/slack.html)
  — apostrophe in path is genuine); follow-up
  ["Slack as group mind"](https://abe-winter.github.io/2018/07/31/group-mind.html).
- **Discord as knowledge sink.** "Where information goes to die" is a recurring theme,
  not one essay — concrete threads: ["Discord is a black hole for information"](https://news.ycombinator.com/item?id=30311982) (2022),
  ["Discord, or the Death of Lore"](https://news.ycombinator.com/item?id=35050858) (2023),
  [information-black-hole comment](https://news.ycombinator.com/item?id=36919534) (2023).
  Common substance: unsearchable from the open web, unlinkable, lost when servers close.
- **Not found / skipped:** no Jacob Kaplan-Moss "Why Zulip" essay exists as far as I
  could find; no well-sourced IRC-density-nostalgia essay — both omitted rather than
  hand-waved.

The pattern relevant to Quorus: the praised properties are **linkability, context on
return, and one-conversation-at-a-time reading** — properties of structure and unread
UX, not of visual chrome. Quorus rooms are already linkable (`/room/<id>`; ADR 0008
treats screenshots as the shareable artifact) and seq is a stable anchor; the redesign
should spend its effort on return-context (dividers, gap headers, unread line), which is
exactly what the rejected terminal aesthetic did not address.

---

## Candidate directions for Quorus

All three keep: flat left-aligned rows, everything-left alignment (observer-first, § 2),
a small hand-picked sender palette assigned by name hash (Telegram/WeeChat/irssi
pattern, § 2), boxed mono code inside proportional prose (§ 1), a composer that states
the join consequence up front via a Zulip-#16751-style non-blocking notice (§ 3), and
the existing pin-to-bottom + jump pill with Sendbird's tall-message refinement (§ 4).

### Direction A — "Coalesced room log" (Slack/Discord-native)

**Combines:** Slack Clean-theme rows with same-sender coalescing (§ 1) + colored initial
chips as the left anchor (Gravatar-`initials`/boring-avatars determinism, § 2) + a
seq-anchored new-messages divider and Esc-style catch-up (§ 4) + Discord's
composer-slot state messaging, but with copy that explains itself (§ 3).
**Why it fits:** the most *chat-native* answer to "not Warp" — it reads instantly as a
room, not a terminal. Coalescing matters specifically for Quorus's bursty cadence (an
agent emitting 4 messages in 20 s becomes one visual block), and initial chips give 2–5
members stronger at-a-glance identity than colored text alone. Lowest risk, most
conventional.

### Direction B — "Session ledger" (Zulip-inflected catch-up view)

**Combines:** Direction A's rows + Zulip's recipient-bar idea mapped to **burst/gap
headers** (a rule + timestamp + "after 41 min" wherever the room went quiet, § 1) +
Zulip's left-edge unread line and skim-on-return model (§ 4) + a restrained dose of the
observability patterns: collapse very long messages/code with expand, keep seq visible
but demoted to hover/metadata (§ 5).
**Why it fits:** designed around the actual usage rhythm — the human returns after
minutes/hours of agent silence and needs "what exchanges happened while I was away,"
which is precisely what Rust engineers credit Zulip for (§ 6). Gap headers give the
transcript narrative shape (exchange by exchange) without inventing threads or new
data-model concepts. Slightly more novel than A, still fully chat-shaped.

### Direction C — "Comment feed" (Linear/Campsite-flavored reading surface)

**Combines:** an uncoalesced document-like feed — every message gets a full name +
timestamp header, generous measure, light background, calm typography (the
Linear-issue-activity register, § 1 — *visual specifics observed, not documented*) +
Campsite's post-first "records over chatter" framing + web-public-Zulip's
"reading is a first-class experience" stance (§ 3) + the same seq-anchored unread
divider.
**Why it fits:** treats the room as a *record to read* more than a stream to watch —
strongest for the screenshot-as-artifact goal (ADR 0008) and for long technical
messages. Weakest for rapid bursts (headers repeat, density drops), so it fits only if
rooms trend toward few, long messages.

**Recommendation:** Direction **B** — A's chat-native base plus gap headers and a
seq-anchored unread line. It is the only option that turns Quorus's two distinctive
facts (monotonic seq, bursty cadence) into UX instead of decoration, and it directly
answers the catch-up need that the best-liked technical chat tool is praised for.

---

## Flagged / unverified items

- **Slack:** same-sender grouping window undocumented (no N-minute figure exists to
  cite); red "New messages" divider and jump pill absent from current help articles;
  preview-bar copy/composer replacement undocumented (preview *flow* is first-party via
  the channel-search blog); hover-timestamp source is a tweet, not docs.
- **Discord:** grouping interval (7/8 min) community-forum only; "highest colored role
  wins" phrasing unverifiable (support article 403'd; dev docs corroborate indirectly);
  composer permission string verified only via user posts on Discord's own forum;
  "NEW MESSAGES" bar copy not vendor-documented; highlight.js detail from search
  excerpts of the official markdown article.
- **Telegram/WhatsApp/iMessage:** bubble layout and mine-right alignment are observed
  convention with no vendor write-up (Telegram's color algorithm *is* verified from
  spec + client source; its bubble layout is not).
- **Zulip:** same-sender coalescing within a group observed, not help-documented; the
  in-pane unread-count banner copy not help-documented.
- **Twitch:** help.twitch.tv unrenderable; composer states ("Log in to Chat",
  followers-only input notice) observed/secondary only.
- **YouTube:** logged-out composer copy undocumented; viewer-page details partially from
  search excerpts.
- **Linear/Campsite:** comment-feed visual styling observed; no published design spec.
- **Google letter avatars:** no primary source.
- **Devin:** "Planner" tab name absent from current docs.
- **HN threads:** dates from search snippets; threads not individually read.
- **Live-tail pattern:** no neutral design-system source; chat-SDK vendor docs are the
  best available primaries.
- **Alignment rationale (all-left vs mine-right):** convention + reasoning, no vendor
  rationale doc.
