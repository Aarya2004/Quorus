import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./config";

describe("loadAuthConfig", () => {
  it("parses QUORUS_TOKENS into token mode with a token→member map", () => {
    const auth = loadAuthConfig({
      QUORUS_TOKENS: '{"tk_aarya":"aarya","tk_arav":"arav"}',
    });

    expect(auth.mode).toBe("token");
    if (auth.mode !== "token") throw new Error("unreachable");
    expect(auth.tokens.get("tk_aarya")).toBe("aarya");
    expect(auth.tokens.get("tk_arav")).toBe("arav");
    expect(auth.tokens.size).toBe(2);
  });

  it("enters open mode when QUORUS_INSECURE is set", () => {
    const auth = loadAuthConfig({ QUORUS_INSECURE: "true" });
    expect(auth.mode).toBe("open");
  });

  it("refuses to boot when nothing is configured (fail-closed)", () => {
    expect(() => loadAuthConfig({})).toThrow(/QUORUS_TOKENS|QUORUS_INSECURE/);
  });

  it("refuses open mode on a Fly target (FLY_APP_NAME present)", () => {
    expect(() => loadAuthConfig({ QUORUS_INSECURE: "true", FLY_APP_NAME: "quorus" })).toThrow(
      /production/i,
    );
  });

  it("refuses open mode when NODE_ENV is production", () => {
    expect(() => loadAuthConfig({ QUORUS_INSECURE: "true", NODE_ENV: "production" })).toThrow(
      /production/i,
    );
  });

  it("rejects malformed QUORUS_TOKENS JSON", () => {
    expect(() => loadAuthConfig({ QUORUS_TOKENS: "not json" })).toThrow(/QUORUS_TOKENS/);
  });

  it("rejects an empty QUORUS_TOKENS map", () => {
    expect(() => loadAuthConfig({ QUORUS_TOKENS: "{}" })).toThrow(/QUORUS_TOKENS/);
  });
});
