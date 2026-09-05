// Imported before `node:sqlite` so its one-time "experimental feature" warning
// is silenced at module-load time. Every other process warning passes through.
// Only Node 22/23 emit the warning (verified 2026-09-04: 22.23 warns, 24.20
// loads silently). Delete this file when `engines.node` rises to >=24.
const original = process.emitWarning;
process.emitWarning = function patched(warning: string | Error, ...args: unknown[]) {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) return;
  (original as (...a: unknown[]) => void).apply(process, [warning, ...args]);
} as typeof process.emitWarning;
