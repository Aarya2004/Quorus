---
status: accepted
---

# Single-node SQLite persistence via node:sqlite

Quorus persists Rooms, Membership, and Messages in **SQLite**, using Node's built-in
**`node:sqlite`** (`DatabaseSync`), behind the `Store` interface.

This follows from four decisions reasoned out from first principles:

1. **Retention is indefinite** — the message log is the authoritative record (the `seq`
   cursor depends on it), so the backend must be durable, not an ephemeral buffer.
2. **Single-node** — multi-node/HA is deferred, which makes an *embedded* store viable
   and avoids running any external service.
3. **Query-able / relational** — discovery ("which Rooms is a Member in?") and planned
   access control need indexed lookups and joins, ruling out flat files and key-value
   stores.
4. Durable + single-node + relational ⇒ **embedded SQL**, i.e. SQLite. `node:sqlite`
   over `better-sqlite3` because it is zero-dependency (no native addon → trivial
   deploy), and its synchronous single-connection model keeps `seq` strictly monotonic
   without an explicit lock.

## Considered Options

- **better-sqlite3** — more battle-tested, but a native addon (prebuilt-binary / musl /
  Node-ABI friction in containers). The `Store` seam makes switching to it a one-file
  change if `node:sqlite` ever disappoints.
- **Postgres / serverless Postgres** — the right answer once we need multi-node or HA,
  but an external networked service contradicts the single-node + simple-deploy goals.
- **libSQL/Turso** — SQLite-compatible with a replication/hosting path; skipped as
  premature for a need (multi-node) we deferred.
- **Key-value (LMDB) / files (JSONL)** — not relational enough for access-control joins.

## Consequences

- **Single point of failure**: the DB is one file on one node. Deploy must keep that
  node and its **persistent volume** alive; back up by snapshotting the file.
- **Node floor**: `node:sqlite` is flag-free from Node v22.13 / v24 LTS; the project
  therefore targets Node ≥ 22.13 (24 LTS recommended).
- `node:sqlite` is a **Release Candidate** (Stability 1.2), not yet fully stable — minor
  API changes are possible. The risk is bounded by the `Store` seam.
- The JSONL store stays as a zero-config dev alternative; both backends are held to one
  shared store-contract test suite.
- Multi-node, access-control schema, and a migration runner are **future** work, each
  decided when reached.
