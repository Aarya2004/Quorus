---
status: accepted
---

# Delivery is manual/poll now; Claude channel wake later; not long-poll

Members learn of new Messages by **polling** `get_messages` — driven by the
human or a `/loop`/cron. This is an accepted limitation, not a chosen ideal. We
investigated making coordination hands-free and concluded there is no good
*portable* way to do it today.

## Decision

- **Now: manual / poll.** The agent checks for Messages when prompted. Yes, it's
  toil ("remind the agent to go collaborate"); we accept it for now.
- **Later (the ideal): Claude Code `claude/channel` wake.** A server notification
  (`notifications/claude/channel`, declared via `capabilities.experimental`) that
  wakes an idle agent and feeds it the Message — true hands-free coordination,
  the experience we actually want and the best demo. Deferred because it is
  Claude-Code-only, a research preview, and the idle-wake path is currently buggy
  (open Claude Code issues). Revisit when it stabilises; keep it an *optional*
  per-client enhancement layered over the portable poll core, never a hard
  dependency.

## Considered options

- **Long-poll (`wait` mode on `get_messages`):** server holds the request open
  until a Message arrives or a ~25–30s timeout. **Rejected.** A tool call is
  synchronous from the agent's side, so holding it open *freezes the agent for
  the whole duration* — it cannot act and, critically, cannot return control to
  the human. For the common "anything new? no → back to the human" case this is
  strictly worse than instant-return polling. Bounding the hold under client/proxy
  tool-timeouts (Claude Code's ~60s wall-clock, which progress notifications do
  not extend) doesn't fix the freeze, only caps it. Waiting for a peer Message is
  an inherently *asynchronous, out-of-band* event; expressing it as a synchronous
  call (held or repeated) is the wrong shape — which is exactly why the right
  answer is an out-of-band wake (the deferred channel), not a slower poll.
- **Standard MCP `notifications/*` / sampling as a portable wake:** **Rejected as
  unavailable.** Clients treat `notifications/*` as state updates, not triggers to
  take a turn (some, e.g. Gemini CLI, don't process server notifications at all).
  Sampling is barely implemented (reliably only VS Code/Copilot), is human-gated
  by spec, and isn't a "resume the task" wake even where present. No portable
  hands-free primitive exists across Cursor / Windsurf / Gemini CLI / Codex /
  Cline / Roo / Pi.

## Consequences

- The portable core stays a plain `get_messages` poll keyed on `seq` — works on
  every MCP client, consistent with the cross-client goal.
- "Hands-free coordination" is **not** a property Quorus can claim portably today;
  any demo of it is Claude-Code-specific and depends on `claude/channel` maturing.
- A future contributor will be tempted to add long-poll as the "obvious" fix —
  this ADR is why not.
- *2026-08-24 (ADR 0007):* MCP 2026-07-28 adds `subscriptions/listen`, and Quorus
  now emits "Room changed" resource-update pings on it — but no client turns a
  notification into an agent turn, and Claude Channels explicitly cannot ride
  2026-07-28, so the decision above stands: pings are a latency hint, poll is
  delivery.
