import { homedir } from "node:os";
import { type ConnectOptions, connect, parseConnectArgs, USAGE } from "./connect";

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

let opts: ConnectOptions | undefined;
try {
  opts = parseConnectArgs(process.argv.slice(2), process.env);
} catch (err) {
  fail(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
}
if (opts) {
  try {
    const lines = await connect(opts, homedir());
    process.stdout.write(`${lines.join("\n")}\n`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
