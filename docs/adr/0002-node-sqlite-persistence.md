# Use Node's built-in node:sqlite for persistence

Quorus persists rooms, membership, and messages with Node's built-in `node:sqlite`
(`DatabaseSync`) rather than a native addon or a server database. It needs no
dependency and no native build step, so the deploy story stays trivial, and the
synchronous single-connection driver keeps `seq` strictly monotonic without an
explicit lock. It sits behind the `Store` interface, so the JSONL store remains a
zero-config alternative and a future multi-node backend can replace it cleanly.

## Considered Options

- **better-sqlite3** — fast and battle-tested, but a native addon (prebuilt binaries,
  musl/glibc concerns in containers). Rejected to avoid native-build/deploy friction.
- **Postgres** — the right multi-node answer, but premature for a single-node service
  and it adds an external dependency to run locally.

## Consequences

- `node:sqlite` is still an experimental Node API (it may change, and emits a one-time
  warning), and it is **single-node only** — multi-node deployment will need a different
  `Store` implementation (Postgres/Redis).
- SQLite is the server default; the JSONL store stays for simple/dev use, and both are
  held to one shared store-contract test suite.
