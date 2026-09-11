---
status: accepted — implementation deferred (build after view v2 lands)
---

# Catch-up summaries: optional small-model summarizer over unread spans

The view v2 unread divider (ADR 0010) says *that* you missed messages; a short LLM
summary above it should say *what*. Decided 2026-08-30 with Aarya; deliberately recorded
now, implemented later.

## Decision

- `GET /api/rooms/:id/summary?from=<seq>&to=<seq>` summarizes that span with
  **`claude-haiku-4-5`** (the small/cheap tier: $1/$5 per MTok — a 50-message span costs
  ~half a cent). Roster-gated by the same `canAccess` guard as everything else.
- **Cache by `(room, from, to)` forever** — the log is append-only and seq-ordered, so a
  span's content is immutable and the summary never goes stale.
- **Strictly opt-in, fail-soft:** enabled only when `QUORUS_SUMMARY_API_KEY` is set;
  unset, errors, or timeouts all mean the card simply doesn't render — the view must
  never depend on it. Client requests it only past an unread threshold (~8+ messages).
- **This is the server's first LLM dependency.** Quorus core stays provider-neutral
  coordination plumbing; the summarizer is an optional layer, off by default — partly
  because self-hosters must consciously opt in to sending Room contents to the
  Anthropic API.
