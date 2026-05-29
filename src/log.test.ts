import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "./log";

describe("log", () => {
  let out: string[];
  const original = process.env.QUORUS_LOG_LEVEL;

  beforeEach(() => {
    out = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      out.push(line);
    });
    vi.spyOn(console, "error").mockImplementation((line: string) => {
      out.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.QUORUS_LOG_LEVEL = original;
  });

  it("renders event + fields as a greppable line", () => {
    process.env.QUORUS_LOG_LEVEL = "info";
    log.info("tool.ok", { tool: "send_message", member: "alice", seq: 3 });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("INFO tool.ok");
    expect(out[0]).toContain("tool=send_message");
    expect(out[0]).toContain("member=alice");
    expect(out[0]).toContain("seq=3");
  });

  it("quotes values containing spaces and omits undefined fields", () => {
    process.env.QUORUS_LOG_LEVEL = "info";
    log.warn("tool.err", { reason: "room not found", room: undefined });
    expect(out[0]).toContain('reason="room not found"');
    expect(out[0]).not.toContain("room=");
  });

  it("respects the level threshold", () => {
    process.env.QUORUS_LOG_LEVEL = "warn";
    log.info("ignored", {});
    log.debug("ignored", {});
    log.warn("kept", {});
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("kept");
  });

  it("silent suppresses everything", () => {
    process.env.QUORUS_LOG_LEVEL = "silent";
    log.error("nope", {});
    expect(out).toHaveLength(0);
  });
});
