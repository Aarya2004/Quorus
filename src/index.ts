import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { loadAuthConfig } from "./config";
import { log } from "./log";
import { createApp } from "./server/app";
import { SqliteStore } from "./store/sqlite-store";

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.QUORUS_DATA_DIR ?? "./data";
const dbPath = process.env.QUORUS_DB_PATH ?? join(dataDir, "quorus.db");

// Resolve auth before binding the port — fail-closed: a bad/absent config throws
// here and the process never accepts a request (ADR 0005).
const auth = loadAuthConfig(process.env);
if (auth.mode === "open") {
  log.warn("auth.mode", { mode: "open", detail: "NO AUTH — x-quorus-member trusted. Dev only." });
} else {
  log.info("auth.mode", { mode: "token", members: auth.tokens.size });
}

mkdirSync(dataDir, { recursive: true });
const app = createApp(new SqliteStore(dbPath), auth);

serve({ fetch: app.fetch, port }, (info) => {
  log.info("server.start", { url: `http://localhost:${info.port}/mcp`, db: dbPath });
});
