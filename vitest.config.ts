import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Keep test output clean; log.test.ts sets its own level explicitly.
    env: { QUORUS_LOG_LEVEL: "silent" },
  },
});
