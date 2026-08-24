---
status: accepted
---

# Fail-closed per-Member token auth, with a dev-only open mode

At the time of writing, the Fly deploy shipped un-gated: `x-quorus-member` was
self-asserted, so anyone with the URL could post as any Member (ADR 0004 /
`docs/deploy.md` auth gate). Before any real dogfood we gate `/mcp`. (Status:
implemented the same day — commits cbcaf4c…db88a11, 2026-06-02.) We chose **per-Member bearer tokens** that *derive*
identity, defaulting **fail-closed**, with an explicit **open mode** for local dev
that is structurally forbidden on a production target.

## Decision

Two auth modes, resolved once at startup by `src/config.ts` (fails fast; the
resolved mode is logged at boot from `src/index.ts`):

- **`token` (production).** The request carries `Authorization: Bearer <token>`.
  The server maps the token to a Member via the `QUORUS_TOKENS` secret (a JSON
  object `{ "<token>": "<member>" }`). **Identity is derived from the token**, not
  from a client header. A present-but-contradicting `x-quorus-member` header is a
  `401` (it can fail a request, never grant an identity); an absent one is fine.
- **`open` (dev / self-host).** No token; identity comes from the
  `x-quorus-member` header — today's zero-config behaviour. Enabled only by an
  explicit `QUORUS_INSECURE=true`.

**Fail-closed rules:**

1. No config at all (no `QUORUS_TOKENS`, no `QUORUS_INSECURE`) → **refuse to boot**.
   "I couldn't find config" never resolves to open.
2. `QUORUS_INSECURE=true` **and** a production indicator present (`FLY_APP_NAME`,
   which Fly always injects, or `NODE_ENV=production`) → **refuse to boot**. Open
   mode cannot run on the deploy even if a dev `.env` leaks into it.

Zero-config local dev is preserved by shipping the opt-out (`QUORUS_INSECURE=true`
in `.env.example` / the `npm run dev` script), so a clone runs with no *manual*
setup while the deploy never carries it.

## Considered options

- **Shared static token.** One secret both users hold. Rejected: identity stays
  self-asserted (both holders can set any `x-quorus-member`), so it gates outsiders
  but leaves Member attribution — the core product bet — forgeable. Per-Member
  tokens cost the same (a map lookup vs. a string compare) and close the hole.
- **Presence-of-secret as the switch** ("auth on iff `QUORUS_TOKENS` is set").
  Rejected: the classic fail-open footgun — a secret that fails to mount, is
  renamed, or is emptied makes the app boot *open* with no warning. Our default
  makes that same failure a loud boot crash instead.
- **`NODE_ENV` as the switch.** Rejected: Fly does not set `NODE_ENV=production`
  (it stays `development`), so the security posture would default to the unsafe
  value on the actual deploy target; and 12-factor calls keying config off
  `NODE_ENV` an anti-pattern. It survives only as a secondary tripwire signal.
- **Full OAuth 2.1 (the MCP spec's mechanism).** MCP authorization is OPTIONAL;
  OAuth is only mandated *if* you implement that mechanism. Disproportionate for a
  two-person dogfood. Deferred to the alpha tier. `Authorization: Bearer` keeps the
  wire shape so a later migration changes validation, not transport.

## Consequences

- **A fresh `node dist/index.js` with no env exits non-zero** — expected, not a
  bug. The message names both remedies (`QUORUS_TOKENS` or `QUORUS_INSECURE`).
- **The app crashes if `QUORUS_INSECURE` is set on Fly.** Deliberate — do not
  "fix" it by removing the `FLY_APP_NAME` check; that check is what makes
  prod-open impossible rather than merely discouraged. `config.ts` therefore
  knowingly references a Fly-specific env var.
- **Adding a Member = edit the `QUORUS_TOKENS` secret + redeploy** (a machine
  restart). Fine for a handful of people; dynamic self-signup is a separate
  identity system, deferred to the alpha tier.
- Survives scale-to-zero (ADR 0004): the token rides every request, so identity is
  re-derivable after a cold start with no server-side session state.
