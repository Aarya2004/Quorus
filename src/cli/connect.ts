// `quorus connect`: register a Quorus server in an agent's MCP config (ADR 0013).
//
// An edge tool: it runs on the user's machine, checks the credential against the
// server, then hands the server URL + credential to the agent's own config. The
// server is unaware of it and it is not part of the server bundle.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";

export const SERVER_NAME = "quorus";
/** Codex reads bearer tokens from an env var; it has no static-header CLI flag. */
export const TOKEN_ENV = "QUORUS_TOKEN";

const Agent = z.enum(["claude", "codex", "cursor", "pi"]);
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

/** `complete: false` means the user has a step left (in `notes`) before the agent can connect. */
export type Plan = { steps: Step[]; notes: string[]; complete: boolean };

/** Where the user's config lives and what their shell holds. */
export type Machine = { home: string; env: NodeJS.ProcessEnv };

export const USAGE = `Usage: npm run connect -- <${Agent.options.join("|")}> --url <server-url> [--token <token> | --member <name>]

  --url     The Quorus server, e.g. https://quorus.example.com (a trailing /mcp is fine)
  --token   Your Member Token. Prefer setting ${TOKEN_ENV}: flags show up in shell history
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
    throw new Error(`Name exactly one agent: ${Agent.options.join(", ")}.`);
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
export function planConnect(opts: ConnectOptions, { home, env }: Machine): Plan {
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
        complete: true,
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
        ...codexEnvNotes(env[TOKEN_ENV], opts.credential),
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
        complete: true,
      };
    case "pi":
      return {
        // Same JSON shape `pi mcp add` writes, merged directly so the file gets 0600 (pi
        // leaves it world-readable) and the credential stays out of argv.
        steps: [
          {
            kind: "merge-json",
            path: join(env.PI_CODING_AGENT_DIR ?? join(home, ".pi", "agent"), "mcp.json"),
            // pi expands `$NAME` / `${NAME}` in header values; `$$` is a literal `$`.
            entry: {
              url: opts.mcpUrl,
              headers: { Authorization: auth.replaceAll("$", () => "$$") },
            },
          },
        ],
        notes: ["Start a new pi session to load the server; check it with `pi mcp list`."],
        complete: true,
      };
    default: {
      const _exhaustive: never = opts.agent;
      return _exhaustive;
    }
  }
}

/** Codex authenticates with whatever its environment holds, not what we checked. */
function codexEnvNotes(current: string | undefined, credential: string) {
  if (current === credential) {
    return { notes: [`Codex reads ${TOKEN_ENV}, which this shell already holds.`], complete: true };
  }
  const export_ = `  export ${TOKEN_ENV}=<your credential>`;
  return {
    notes: current
      ? [
          `${TOKEN_ENV} in this shell holds a different credential. Codex would use that one; set:`,
          export_,
        ]
      : [`Codex reads the credential from ${TOKEN_ENV}. Add this to your shell profile:`, export_],
    complete: false,
  };
}

/** `err.code` from a Node system error, without trusting the shape. */
function errnoCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
    ? err.code
    : undefined;
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return undefined;
    throw err;
  }
}

/** Follow a symlinked config (dotfile managers) so we update the file, not replace the link. */
async function resolveConfigPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if (errnoCode(err) !== "ENOENT") throw err;
  }
  const isLink = await lstat(path).then(
    (s) => s.isSymbolicLink(),
    () => false,
  );
  if (isLink)
    throw new Error(`${path} is a symlink to a missing file; fix it or add the server by hand.`);
  return path;
}

const McpJson = z.looseObject({ mcpServers: z.record(z.string(), z.unknown()).optional() });

/**
 * Set `mcpServers.quorus` in an MCP JSON config, keeping everything else. Refuses a
 * file it can't parse rather than overwriting it.
 */
export async function mergeMcpJson(link: string, entry: McpEntry): Promise<void> {
  const path = await resolveConfigPath(link);
  const text = await readIfExists(path);
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
  // Write-then-rename so a crash never leaves a half-written config. A fresh, exclusive
  // temp file guarantees 0600 (it holds a credential); an existing one could keep its mode.
  const tmp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    // Narrow the read-modify-write race: never overwrite an edit made since we read.
    if ((await readIfExists(path)) !== text) {
      throw new Error(`${path} changed while connecting; run the command again.`);
    }
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
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

const execFileAsync = promisify(execFile);

/** Run one step. `secret` is scrubbed from any child output we surface (it rides argv). */
export async function runStep(step: Step, secret: string): Promise<void> {
  if (step.kind === "merge-json") return mergeMcpJson(step.path, step.entry);
  const [cmd, ...args] = step.argv;
  try {
    await execFileAsync(cmd, args);
  } catch (err) {
    if (step.mayFail) return;
    if (errnoCode(err) === "ENOENT") {
      throw new Error(`\`${cmd}\` is not on your PATH. Install it first.`);
    }
    const stderr =
      typeof err === "object" && err !== null && "stderr" in err && typeof err.stderr === "string"
        ? err.stderr.replaceAll(secret, "<credential>").trim()
        : "";
    throw new Error(
      `\`${cmd} ${args.slice(0, 2).join(" ")}\` failed${stderr ? `: ${stderr}` : "."}`,
    );
  }
}

/** Verify the credential, then apply the plan. Returns lines to show the user. */
export async function connect(opts: ConnectOptions, machine: Machine): Promise<string[]> {
  const member = await whoAmI(opts.mcpUrl, opts.credential);
  const plan = planConnect(opts, machine);
  for (const step of plan.steps) await runStep(step, opts.credential);
  const headline = plan.complete
    ? `Connected ${opts.agent} to ${opts.mcpUrl} as ${member}.`
    : `Configured ${opts.agent} for ${opts.mcpUrl} as ${member}. One step left:`;
  return [headline, ...plan.notes];
}
