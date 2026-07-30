import { describe, expect, it } from "vitest";
import { isUsableFinish, messageForBlock, messageForStatus } from "./errors";

describe("messageForStatus", () => {
  it("names the key only when the key is actually the problem", () => {
    // Saying "check your key" on a quota error sends the reader hunting for a
    // fault that isn't there, so only 401/403 mention it.
    expect(messageForStatus(401)).toContain("GEMINI_API_KEY");
    expect(messageForStatus(403)).toContain("GEMINI_API_KEY");
    expect(messageForStatus(429)).not.toContain("GEMINI_API_KEY");
    expect(messageForStatus(500)).not.toContain("GEMINI_API_KEY");
  });

  it("tells the reader a rate limit resolves itself", () => {
    const message = messageForStatus(429);
    expect(message).toMatch(/rate limit/i);
    expect(message).toMatch(/again/i);
  });

  it("owns a genuinely malformed request as our bug rather than blaming the reader", () => {
    expect(messageForStatus(400)).toMatch(/bug in FableKeeper/i);
  });

  it("reads a bad key out of a 400, because that is what Gemini returns for one", () => {
    // Verified against the real SDK: an invalid key comes back as
    // 400 INVALID_ARGUMENT with reason API_KEY_INVALID, *not* 401/403. Keying
    // off status alone reported the most likely real failure as an internal
    // bug and sent the reader looking in the wrong place entirely.
    const body =
      '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}';
    expect(messageForStatus(400, body)).toContain("GEMINI_API_KEY");
    expect(messageForStatus(400, body)).not.toMatch(/bug in FableKeeper/i);
  });

  it("matches either the machine reason or the human message", () => {
    // The two travel together today, but the reason code is the stable one and
    // the prose is not, so neither is relied on alone.
    expect(messageForStatus(400, '{"reason":"API_KEY_INVALID"}')).toContain("GEMINI_API_KEY");
    expect(messageForStatus(400, "API key not valid")).toContain("GEMINI_API_KEY");
  });

  it("does not mistake unrelated 400s for a key problem", () => {
    expect(messageForStatus(400, '{"message":"Invalid JSON payload"}')).toMatch(/bug in FableKeeper/i);
  });

  it("treats any 5xx as an upstream problem", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(messageForStatus(status)).toMatch(/Gemini API is having trouble/i);
    }
  });

  it("falls back to something generic for an unknown or missing status", () => {
    expect(messageForStatus(418)).toBe("Something went wrong generating that draft.");
    expect(messageForStatus(undefined)).toBe("Something went wrong generating that draft.");
  });
});

describe("messageForBlock", () => {
  it("only suggests rewording when rewording could actually help", () => {
    // A blocked prompt is fixable by rewriting it; a mid-generation stop is not
    // the brief's fault in the same way.
    expect(messageForBlock("SAFETY", "prompt")).toMatch(/less graphically|rewording/i);
    expect(messageForBlock("MAX_TOKENS", "response")).toMatch(/narrower brief/i);
  });

  it("explains a length cut-off as length, not as a refusal", () => {
    // These read very differently to a GM: one means "try again smaller", the
    // other means "the model said no".
    expect(messageForBlock("MAX_TOKENS", "response")).not.toMatch(/declined/i);
    expect(messageForBlock("PROHIBITED_CONTENT", "prompt")).toMatch(/declined/i);
  });

  it("reassures that dark subject matter is not itself the problem", () => {
    // A PF2E campaign is full of violence; a GM whose villain brief trips the
    // filter should not conclude the tool refuses ordinary fantasy content.
    expect(messageForBlock("SAFETY", "prompt")).toMatch(/Dark subject matter is usually fine/i);
  });

  it("handles a recitation stop distinctly", () => {
    expect(messageForBlock("RECITATION", "response")).toMatch(/reproducing existing text/i);
  });

  it("still says something useful for an unrecognised reason", () => {
    expect(messageForBlock(undefined, "prompt")).toMatch(/declined/i);
    expect(messageForBlock("SOMETHING_NEW", "response")).toMatch(/stopped before finishing/i);
  });
});

describe("isUsableFinish", () => {
  it("accepts a normal stop, and an absent reason", () => {
    // Gemini omits finishReason on some successful responses, so treating
    // "missing" as a failure would reject perfectly good drafts.
    expect(isUsableFinish("STOP")).toBe(true);
    expect(isUsableFinish(undefined)).toBe(true);
  });

  it("rejects every reason that leaves the JSON absent or truncated", () => {
    for (const reason of ["SAFETY", "MAX_TOKENS", "RECITATION", "OTHER", "PROHIBITED_CONTENT"]) {
      expect(isUsableFinish(reason)).toBe(false);
    }
  });
});
