import type { Context } from "hono";
import type { AuthConfig } from "../config";
import { log } from "../log";

/**
 * Resolve the authenticated Member for a request, or null to reject.
 *
 * - `open`: identity is the self-asserted `x-quorus-member` header (dev only).
 * - `token`: identity is *derived* from the `Authorization: Bearer` token; a
 *   client-supplied `x-quorus-member` may not contradict it (it can fail a
 *   request, never grant an identity). Tokens are never logged.
 *
 * Shared by the MCP endpoint and the human-view API — every HTTP surface
 * authenticates the same way (ADR 0005/0008).
 */
export function resolveMember(c: Context, auth: AuthConfig): string | null {
  if (auth.mode === "open") {
    // Identity is self-asserted in open mode; the browser view can only send
    // a Bearer value, so accept it as the asserted name too.
    const header = c.req.header("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const member = c.req.header("x-quorus-member")?.trim() || bearer;
    if (!member) {
      log.warn("request.reject", { reason: "missing member identity" });
      return null;
    }
    return member;
  }

  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const member = token ? auth.tokens.get(token) : undefined;
  if (!member) {
    log.warn("request.reject", { reason: "bad token" });
    return null;
  }

  // A client-supplied member name may not contradict the token's identity.
  const claimed = c.req.header("x-quorus-member")?.trim();
  if (claimed && claimed !== member) {
    log.warn("request.reject", { reason: "identity mismatch", member });
    return null;
  }
  return member;
}
