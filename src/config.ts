// Auth configuration, resolved once at startup from the environment.
//
// Fail-closed: see ADR 0005. No config refuses to boot; an explicit
// `open` mode is offered for local dev and fenced off any production target.

export type AuthConfig = { mode: "open" } | { mode: "token"; tokens: Map<string, string> };

/**
 * Resolve the auth mode from `env`. Takes the environment as an argument (not
 * `process.env`) so every branch is a pure, testable function call. Throws on
 * any invalid or unsafe configuration rather than degrading to open access.
 */
export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const insecure = env.QUORUS_INSECURE === "true";

  if (insecure) {
    // Tripwire: open mode must never run on a production target. Fly always
    // injects FLY_APP_NAME, so it can't be forgotten the way NODE_ENV can;
    // NODE_ENV=production is a second corroborating signal.
    const prodTarget = env.FLY_APP_NAME
      ? "FLY_APP_NAME"
      : env.NODE_ENV === "production"
        ? "NODE_ENV=production"
        : null;
    if (prodTarget) {
      throw new Error(
        `Refusing to start: QUORUS_INSECURE=true on a production target (${prodTarget} set). ` +
          "Open auth is dev-only.",
      );
    }
    return { mode: "open" };
  }

  if (!env.QUORUS_TOKENS) {
    throw new Error(
      "Refusing to start: no QUORUS_TOKENS configured and QUORUS_INSECURE is not " +
        "set. Set QUORUS_TOKENS for production, or QUORUS_INSECURE=true for local dev.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(env.QUORUS_TOKENS);
  } catch {
    throw new Error("Invalid QUORUS_TOKENS: expected a JSON object of {token: member}.");
  }
  const tokens = new Map<string, string>(Object.entries(parsed as Record<string, string>));
  if (tokens.size === 0) {
    throw new Error("Invalid QUORUS_TOKENS: parsed to zero tokens — no Member could authenticate.");
  }
  return { mode: "token", tokens };
}
