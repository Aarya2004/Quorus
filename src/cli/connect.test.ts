import { lstat, mkdtemp, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { SqliteStore } from "../store/sqlite-store";
import {
  connect,
  mergeMcpJson,
  parseConnectArgs,
  planConnect,
  TOKEN_ENV,
  toMcpUrl,
  whoAmI,
} from "./connect";

const tmp = () => mkdtemp(join(tmpdir(), "quorus-connect-"));

describe("toMcpUrl", () => {
  it.each([
    ["http://localhost:8787", "http://localhost:8787/mcp"],
    ["http://localhost:8787/", "http://localhost:8787/mcp"],
    ["http://localhost:8787/mcp", "http://localhost:8787/mcp"],
    ["https://h.example/mcp/", "https://h.example/mcp"],
    ["https://h.example/quorus?x=1#y", "https://h.example/quorus/mcp"],
  ])("%s → %s", (raw, want) => expect(toMcpUrl(raw)).toBe(want));

  it("rejects non-http URLs and garbage", () => {
    expect(() => toMcpUrl("ftp://h")).toThrow(/http/);
    expect(() => toMcpUrl("localhost:8787")).toThrow(/http/);
    expect(() => toMcpUrl("not a url")).toThrow(/Not a URL/);
  });
});

describe("parseConnectArgs", () => {
  const url = ["--url", "http://h:8787"];

  it("takes the token from the flag, then the env", () => {
    expect(parseConnectArgs(["claude", ...url, "--token", "t1"], {}).credential).toBe("t1");
    expect(parseConnectArgs(["codex", ...url], { [TOKEN_ENV]: "t2" }).credential).toBe("t2");
  });

  it("uses --member as the credential for open-mode servers", () => {
    expect(parseConnectArgs(["cursor", ...url, "--member", "alice"], {})).toEqual({
      agent: "cursor",
      mcpUrl: "http://h:8787/mcp",
      credential: "alice",
    });
  });

  it("rejects bad input with a message", () => {
    expect(() => parseConnectArgs(["windsurf", ...url, "--token", "t"], {})).toThrow(/one agent/);
    expect(() => parseConnectArgs(["claude", "codex", ...url], {})).toThrow(/one agent/);
    expect(() => parseConnectArgs(["claude", "--token", "t"], {})).toThrow(/--url/);
    expect(() => parseConnectArgs(["claude", ...url], {})).toThrow(/credential/);
    expect(() => parseConnectArgs(["claude", ...url, "--token", "t", "--member", "m"], {})).toThrow(
      /not both/,
    );
    expect(() => parseConnectArgs(["claude", ...url, "--bogus"], {})).toThrow();
  });
});

describe("planConnect", () => {
  const opts = { mcpUrl: "http://h:8787/mcp", credential: "s3cret-tok" } as const;

  it("claude: remove-then-add at user scope with a bearer header", () => {
    const { steps } = planConnect({ ...opts, agent: "claude" }, { home: "/home/u", env: {} });
    expect(steps).toEqual([
      { kind: "exec", argv: ["claude", "mcp", "remove", "-s", "user", "quorus"], mayFail: true },
      {
        kind: "exec",
        argv: [
          "claude",
          "mcp",
          "add",
          "-s",
          "user",
          "-t",
          "http",
          "quorus",
          "http://h:8787/mcp",
          "-H",
          "Authorization: Bearer s3cret-tok",
        ],
        mayFail: false,
      },
    ]);
  });

  it("codex: credential stays out of the config, read from the env var", () => {
    const { steps, notes, complete } = planConnect(
      { ...opts, agent: "codex" },
      { home: "/home/u", env: {} },
    );
    expect(steps).toEqual([
      {
        kind: "exec",
        argv: [
          "codex",
          "mcp",
          "add",
          "quorus",
          "--url",
          "http://h:8787/mcp",
          "--bearer-token-env-var",
          TOKEN_ENV,
        ],
        mayFail: false,
      },
    ]);
    expect(JSON.stringify(steps)).not.toContain("s3cret");
    expect(notes.join("\n")).toContain(`export ${TOKEN_ENV}=`);
    expect(complete).toBe(false);
  });

  it("codex: complete only when the env already holds the checked credential", () => {
    const plan = (value: string) =>
      planConnect({ ...opts, agent: "codex" }, { home: "/h", env: { [TOKEN_ENV]: value } });
    expect(plan("s3cret-tok").complete).toBe(true);
    const stale = plan("other");
    expect(stale.complete).toBe(false);
    expect(stale.notes.join("\n")).toMatch(/different credential/);
    expect(stale.notes.join("\n")).not.toContain("other");
  });

  it("pi: add-or-replace with a bearer header", () => {
    const { steps, complete } = planConnect({ ...opts, agent: "pi" }, { home: "/home/u", env: {} });
    expect(steps).toEqual([
      {
        kind: "exec",
        argv: [
          "pi",
          "mcp",
          "add",
          "quorus",
          "--url",
          "http://h:8787/mcp",
          "--header",
          "Authorization=Bearer s3cret-tok",
        ],
        mayFail: false,
      },
    ]);
    expect(complete).toBe(true);
  });

  it("cursor: merges into ~/.cursor/mcp.json", () => {
    const { steps } = planConnect({ ...opts, agent: "cursor" }, { home: "/home/u", env: {} });
    expect(steps).toEqual([
      {
        kind: "merge-json",
        path: "/home/u/.cursor/mcp.json",
        entry: { url: "http://h:8787/mcp", headers: { Authorization: "Bearer s3cret-tok" } },
      },
    ]);
  });
});

describe("mergeMcpJson", () => {
  const entry = { url: "http://h/mcp", headers: { Authorization: "Bearer t" } };

  it("creates the file (owner-only) when missing", async () => {
    const path = join(await tmp(), "nested", "mcp.json");
    await mergeMcpJson(path, entry);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ mcpServers: { quorus: entry } });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("keeps other servers and top-level keys, replaces an old quorus entry", async () => {
    const path = join(await tmp(), "mcp.json");
    await writeFile(
      path,
      JSON.stringify({ other: 1, mcpServers: { a: { command: "x" }, quorus: { url: "old" } } }),
    );
    await mergeMcpJson(path, entry);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      other: 1,
      mcpServers: { a: { command: "x" }, quorus: entry },
    });
  });

  it("tightens an existing world-readable config to owner-only, leaving no temp files", async () => {
    const dir = await tmp();
    const path = join(dir, "mcp.json");
    await writeFile(path, "{}", { mode: 0o644 });
    await mergeMcpJson(path, entry);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(["mcp.json"]);
  });

  it("writes through a symlinked config, keeping the link", async () => {
    const dir = await tmp();
    const target = join(dir, "dotfiles-mcp.json");
    const link = join(dir, "mcp.json");
    await writeFile(target, JSON.stringify({ mcpServers: { a: { command: "x" } } }));
    await symlink(target, link);
    await mergeMcpJson(link, entry);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(target, "utf8")).mcpServers).toEqual({
      a: { command: "x" },
      quorus: entry,
    });
  });

  it("refuses a symlink to a missing file", async () => {
    const dir = await tmp();
    const link = join(dir, "mcp.json");
    await symlink(join(dir, "gone.json"), link);
    await expect(mergeMcpJson(link, entry)).rejects.toThrow(/missing file/);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
  });

  it("refuses files it can't parse, leaving them untouched", async () => {
    const dir = await tmp();
    for (const body of ["{ // jsonc\n}", "[]", '{"mcpServers": 3}']) {
      const path = join(dir, "mcp.json");
      await writeFile(path, body);
      await expect(mergeMcpJson(path, entry)).rejects.toThrow(/by hand/);
      expect(await readFile(path, "utf8")).toBe(body);
    }
  });
});

describe("against a real server", () => {
  let url: string;
  let close: () => void;
  beforeAll(async () => {
    const dir = await tmp();
    const app = createApp(new SqliteStore(join(dir, "q.db")), {
      mode: "token",
      tokens: new Map([["good-token", "alice"]]),
    });
    await new Promise<void>((resolve) => {
      const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        url = `http://localhost:${info.port}/mcp`;
        close = () => server.close();
        resolve();
      });
    });
  });
  afterAll(() => close());

  it("whoAmI resolves the Member, or explains the failure", async () => {
    await expect(whoAmI(url, "good-token")).resolves.toBe("alice");
    await expect(whoAmI(url, "bad-token")).rejects.toThrow(/rejected the credential/);
    await expect(whoAmI("http://localhost:1/mcp", "x")).rejects.toThrow(/Could not reach/);
  });

  it("connect writes nothing when the credential is rejected", async () => {
    const home = await tmp();
    const opts = { agent: "cursor", mcpUrl: url, credential: "bad-token" } as const;
    await expect(connect(opts, { home, env: {} })).rejects.toThrow(/rejected/);
    await expect(stat(join(home, ".cursor", "mcp.json"))).rejects.toThrow(/ENOENT/);
  });

  it("connect configures cursor end to end", async () => {
    const home = await tmp();
    const lines = await connect(
      { agent: "cursor", mcpUrl: url, credential: "good-token" },
      { home, env: {} },
    );
    expect(lines[0]).toMatch(/^Connected cursor .* as alice\.$/);
    const config = JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"));
    expect(config.mcpServers.quorus).toEqual({
      url,
      headers: { Authorization: "Bearer good-token" },
    });
  });
});
