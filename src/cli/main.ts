import { homedir } from "node:os";
import { type ConnectOptions, connect, parseConnectArgs, USAGE } from "./connect";

function fail(err: unknown, suffix = ""): void {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}${suffix}\n`);
  process.exitCode = 1;
}

let opts: ConnectOptions | undefined;
try {
  opts = parseConnectArgs(process.argv.slice(2), process.env);
} catch (err) {
  fail(err, `\n\n${USAGE}`);
}
if (opts) {
  try {
    const lines = await connect(opts, { home: homedir(), env: process.env });
    process.stdout.write(`${lines.join("\n")}\n`);
  } catch (err) {
    fail(err);
  }
}
