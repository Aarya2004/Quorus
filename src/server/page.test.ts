import { describe, expect, it } from "vitest";
import { PAGE_HTML } from "./page";
import { CLIENT_JS } from "./page-client";

/**
 * The client script is a raw string inlined into PAGE_HTML, so it never meets
 * the TypeScript compiler. These are structural guards: the script must parse,
 * and the mention affordances (ADR 0012) must be wired. Behaviour is verified
 * against a live dev server (see ticket T4's smoke checklist).
 */
describe("human view page", () => {
  it("client script parses as JavaScript", () => {
    expect(() => new Function(CLIENT_JS)).not.toThrow();
  });

  it("styles mention emphasis distinctly from the unread accent", () => {
    // Line-level "for you" emphasis + cosmetic inline @token highlight.
    expect(PAGE_HTML).toContain(".line.forme");
    expect(PAGE_HTML).toContain(".mention");
    expect(PAGE_HTML).toContain(".line.unread");
  });

  it("wires compose autocomplete and the outgoing mentions param", () => {
    // The composer must post a mentions array, not parse prose server-side.
    expect(CLIENT_JS).toMatch(/mentions/);
    // Autocomplete dropdown exists in the shell for the roster offers.
    expect(PAGE_HTML).toContain('id="mentionMenu"');
  });

  it("marks lines mentioning the viewer for emphasis", () => {
    expect(CLIENT_JS).toMatch(/forme/);
  });
});
