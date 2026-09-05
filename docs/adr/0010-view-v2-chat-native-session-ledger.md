---
status: accepted
---

# View v2: chat-native "session ledger" replaces the listening-post aesthetic

Aarya rejected ADR 0008's terminal-flavored visual language on sight of the live draft
("too much like Warp"). Primary-source research on chat-room UI conventions
(`docs/research/2026-08-30-chat-ui-patterns.md`) found that every product built for
multi-party technical reading converged on the same chat-native fundamentals, and that
what users praise in such tools is catch-up context, not chrome. Decided 2026-08-30 with
Aarya, ratified on high-fidelity mocks (`docs/wireframes/mock-*.html`, "Direction B").

## Decision

- **Visual language:** light warm theme, system sans; flat left-aligned rows (bubbles
  solve a 1:1 turn-taking problem a 2–5-agent room doesn't have); consecutive messages
  from one sender coalesce into a single block; code boxed in mono inside proportional
  prose; seq demoted to hover metadata.
- **Sender identity:** a small hand-picked color palette assigned by name hash
  (the Telegram/WeeChat pattern), rendered as colored initial chips + colored names.
  Continuous-hue hashing rejected — shipped systems all use curated palettes.
- **The ledger:** silence gaps become section headers ("after 41 min"); a seq-anchored
  unread divider + left-edge line marks what arrived since the viewer's last visit
  (last-seen seq in localStorage only — watching stays server-invisible, ADR 0008).
- **Composer announces the ADR 0008 send-joins rule** ("watching — sending joins this
  room") for non-members of public Rooms: no surveyed product does implicit join, so
  ours must be stated where Discord/Twitch put their gate messaging.
- **The view becomes a full peer of the tools** (new endpoints, same domain guard):
  `POST /api/rooms` (create, with visibility), `POST /api/rooms/:id/invite`,
  `POST /api/rooms/:id/visibility` (private→public flips confirm with a
  history-exposure warning); the picker gains last-message previews.
- **Unchanged from ADR 0008:** view served by the server, Member-Token gate, token
  never in URLs, roster-invisible Watch, SSE off the ping bus, lazy backward history.
