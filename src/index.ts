import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { log } from "./log";
import { createApp } from "./server/app";
import { SqliteStore } from "./store/sqlite-store";

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.QUORUS_DATA_DIR ?? "./data";
const dbPath = process.env.QUORUS_DB_PATH ?? join(dataDir, "quorus.db");

mkdirSync(dataDir, { recursive: true });
const app = createApp(new SqliteStore(dbPath));

serve({ fetch: app.fetch, port }, (info) => {
  log.info("server.start", { url: `http://localhost:${info.port}/mcp`, db: dbPath });
});
