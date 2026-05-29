import { serve } from "@hono/node-server";
import { log } from "./log";
import { createApp } from "./server/app";
import { JsonlStore } from "./store/jsonl-store";

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.QUORUS_DATA_DIR ?? "./data";

const app = createApp(new JsonlStore(dataDir));

serve({ fetch: app.fetch, port }, (info) => {
  log.info("server.start", { url: `http://localhost:${info.port}/mcp`, data: dataDir });
});
