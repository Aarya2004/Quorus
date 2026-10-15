// `quorus connect`: register a Quorus server in an agent's MCP config (ADR 0013).
//
// An edge tool: it runs on the user's machine, checks the credential against the
// server, then hands the server URL + credential to the agent's own config. The
// server is unaware of it and it is not part of the server bundle.

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";

export const SERVER_NAME = "quorus";
/** Codex reads bearer tokens from an env var; it has no static-header CLI flag. */
export const TOKEN_ENV = "QUORUS_TOKEN";

const Agent = z.enum(["claude", "codex", "cursor"]);
export type Agent = z.infer<typeof Agent>;

export type ConnectOptions = {
  agent: Agent;
  /** The server's `/mcp` endpoint. */
  mcpUrl: string;
  /** Bearer credential: a Member Token, or the Member name on an open-mode server. */
  credential: string;
};

export type Step =
  | { kind: "exec"; argv: [string, ...string[]]; mayFail: boolean }
  | { kind: "merge-json"; path: string; entry: McpEntry };

type McpEntry = { url: string; headers: Record<string, string> };

export type Plan = { steps: Step[]; notes: string[] };

export const USAGE = `Usage: npm run connect -- <claude|codex|cursor> --url <server-url> [--token <token> | --member <name>]

  --url     The Quorus server, e.g. https://quorus.example.com (a trailing /mcp is fine)
  --token   Your Member Token (or set ${TOKEN_ENV})
  --member  Your Member name, for a dev server running in open mode`;

/** Parse CLI arguments. Throws a user-facing message on anything invalid. */
export function parseConnectArgs(args: string[], env: NodeJS.ProcessEnv): ConnectOptions {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      url: { type: "string" },
      token: { type: "string" },
      member: { type: "string" },
    },
  });
  const agent = Agent.safeParse(positionals[0]);
  if (!agent.success || positionals.length !== 1) {
    throw new Error("Name exactly one agent: claude, codex, or cursor.");
  }
  if (!values.url) throw new Error("Missing --url.");
  if (values.token && values.member) throw new Error("Pass --token or --member, not both.");
  const credential = (values.member ?? values.token ?? env[TOKEN_ENV] ?? "").trim();
  if (!credential)
    throw new Error(`Missing credential: pass --token, --member, or set ${TOKEN_ENV}.`);
  return { agent: agent.data, mcpUrl: toMcpUrl(values.url), credential };
}

/** Accept the server root or its `/mcp` endpoint; return the endpoint. */
export function toMcpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Expected an http(s) URL: ${raw}`);
  }
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/mcp$/, "")}/mcp`;
  return url.toString();
}

/** What connecting `agent` takes. Pure: no I/O, so each agent's wiring is testable. */
export function planConnect(opts: ConnectOptions, home: string): Plan {
  const auth = `Bearer ${opts.credential}`;
  switch (opts.agent) {
    case "claude":
      return {
        // `add` refuses an existing name, so remove first; removing a missing one fails harmlessly.
        steps: [
          {
            kind: "exec",
            argv: ["claude", "mcp", "remove", "-s", "user", SERVER_NAME],
            mayFail: true,
          },
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
              SERVER_NAME,
              opts.mcpUrl,
              "-H",
              `Authorization: ${auth}`,
            ],
            mayFail: false,
          },
        ],
        notes: ["Restart Claude Code to load the server."],
      };
    case "codex":
      return {
        // `codex mcp add` overwrites an existing entry of the same name.
        steps: [
          {
            kind: "exec",
            argv: [
              "codex",
              "mcp",
              "add",
              SERVER_NAME,
              "--url",
              opts.mcpUrl,
              "--bearer-token-env-var",
              TOKEN_ENV,
            ],
            mayFail: false,
          },
        ],
        notes: [
          `Codex reads the credential from ${TOKEN_ENV}. Add this to your shell profile:`,
          `  export ${TOKEN_ENV}=<your credential>`,
        ],
      };
    case "cursor":
      return {
        steps: [
          {
            kind: "merge-json",
            path: join(home, ".cursor", "mcp.json"),
            entry: { url: opts.mcpUrl, headers: { Authorization: auth } },
          },
        ],
        notes: ["Reload Cursor to load the server."],
      };
    default: {
      const _exhaustive: never = opts.agent;
      return _exhaustive;
    }
  }
}

const McpJson = z.looseObject({ mcpServers: z.record(z.string(), z.unknown()).optional() });

/**
 * Set `mcpServers.quorus` in an MCP JSON config, keeping everything else. Refuses a
 * file it can't parse rather than overwriting it.
 */
export async function mergeMcpJson(path: string, entry: McpEntry): Promise<void> {
  let text: string | undefined;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  let config: z.infer<typeof McpJson> = {};
  if (text?.trim()) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(`${path} is not plain JSON; add the server by hand.`);
    }
    const parsed = McpJson.safeParse(raw);
    if (!parsed.success)
      throw new Error(`${path} has an unexpected shape; add the server by hand.`);
    config = parsed.data;
  }
  const next = { ...config, mcpServers: { ...config.mcpServers, [SERVER_NAME]: entry } };
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename so a crash never leaves a half-written config. 0600: it holds a credential.
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

const Me = z.object({ member: z.string() });

/** Ask the server who this credential is. Throws a user-facing message on failure. */
export async function whoAmI(mcpUrl: string, credential: string): Promise<string> {
  const url = new URL("api/me", mcpUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`Could not reach ${url.origin}. Is the server running?`);
  }
  if (res.status === 401) throw new Error("The server rejected the credential.");
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${url.pathname}.`);
  const me = Me.safeParse(await res.json().catch(() => undefined));
  if (!me.success) throw new Error(`${url.origin} doesn't look like a Quorus server.`);
  return me.data.member;
}

const run = promisify(execFile);

async function runStep(step: Step): Promise<void> {
  if (step.kind === "merge-json") return mergeMcpJson(step.path, step.entry);
  const [cmd, ...args] = step.argv;
  try {
    await run(cmd, args);
  } catch (err) {
    if (step.mayFail) return;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`\`${cmd}\` is not on your PATH. Install it first.`);
    }
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(
      `\`${cmd} ${args.slice(0, 2).join(" ")}\` failed${stderr ? `: ${stderr}` : "."}`,
    );
  }
}

/** Verify the credential, then apply the plan. Returns lines to show the user. */
export async function connect(opts: ConnectOptions, home: string): Promise<string[]> {
  const member = await whoAmI(opts.mcpUrl, opts.credential);
  const plan = planConnect(opts, home);
  for (const step of plan.steps) await runStep(step);
  return [`Connected ${opts.agent} to ${opts.mcpUrl} as ${member}.`, ...plan.notes];
}
