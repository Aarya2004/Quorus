---
status: accepted
---

# Coordinate between Orchestrators, not implementers (hub-to-hub)

Quorus connects **Orchestrators** — the planner agent that speaks for a whole local swarm —
across machines, plus the humans steering them. Each machine runs its own hub-and-spoke swarm
internally; Quorus is the **mesh between the hubs**. The implementer (worker) agents behind an
Orchestrator are never Members; they are an internal detail of their hub. Messaging is the
coordination primitive; advisory leases/locks are deliberately **deferred**.

This is a deliberate deviation from the obvious path: nearly every comparable tool models flat,
peer-to-peer DMs **between implementers**. We chose the planner tier instead.

## Why

- **Peer messaging among implementers is fragile.** The teams furthest down the multi-agent road
  build hub-and-spoke and avoid worker-to-worker chat — Cognition ("Don't build multi-agents")
  and Anthropic's own research system ("workers never talk to each other"). Coordinating
  *planners* sidesteps this: there are few of them, they already reason about intent, and they
  speak for their swarm.
- **Cross-machine is the unowned ground.** Every traction-having competitor is single-machine
  and Claude-only (Claude Code Agent Teams, git worktrees, MCP Agent Mail). A remote MCP server
  over Streamable HTTP (ADR 0001) is the right shape for connecting hubs across machines and
  across clients (Claude Code ↔ Cursor ↔ Codex). Motivating user story: levelsio asking "why
  can't Claude Code sessions message each other?" while hand-relaying between SSH windows.
- **Humans steer.** A human can join a Room to watch and redirect their Orchestrator — the
  un-taken angle vs. agent-only competitors, and the bridge to a future managed dashboard.
- **Leases are unnecessary here.** Orchestrators on different machines/repos do not collide on
  files, so mutual exclusion is not the felt pain — intent transfer is. Messaging is the
  primitive; leases are revisited only if a Room ever spans a shared working tree.

## Considered Options

- **Flat implementer-to-implementer DMs** (the common pattern: AgentDM, claude-mesh, cc2cc).
  Rejected: re-creates the fragile peer-messaging failure mode, and the niche is unvalidated —
  competitor stars are influencer/blog-driven, not usage-driven.
- **Advisory leases as the headline primitive** (MCP Agent Mail's model). Rejected for the
  cross-machine planner use case: no shared files to lease. Kept on the shelf, not built.

## Consequences

- `Member` stays the general type; **Orchestrator is a usage convention**, not enforced in code.
  A future reader seeing flat `Member` records should not "fix" Quorus into a flat-DM tool — the
  orchestrator framing is intentional.
- This began as a **hypothesis to validate by dogfooding** (Aarya + Arav, two machines), with a
  note to promote to `accepted` if dogfooding confirmed the bet. It did: the bet was validated
  cross-machine at a YC hackathon with the pre-auth build (2026-06) — hence `status: accepted`.
  Delivery mechanics are covered in more detail by ADR 0006. See the Positioning Hypothesis in
  `CONTEXT.md`.
- Delivery is pull/loop for v1; a Channels-style interrupt adapter
  (`notifications/claude/channel`) is later and kept out of the transport-agnostic server core.
