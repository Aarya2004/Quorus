// Tiny structured logger — zero dependencies.
//
// Emits one greppable line per event: `<iso> <LEVEL> <event> key=value …`.
// Level is gated by QUORUS_LOG_LEVEL (debug | info | warn | error | silent),
// read per-call so tests and ops can flip it without import-order surprises.

export type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

function threshold(): number {
  const configured = process.env.QUORUS_LOG_LEVEL as Level | "silent" | undefined;
  return ORDER[configured ?? "info"] ?? ORDER.info;
}

function render(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const parts = [new Date().toISOString(), level.toUpperCase(), event];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      parts.push(`${key}=${render(value)}`);
    }
  }
  const line = parts.join(" ");
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
