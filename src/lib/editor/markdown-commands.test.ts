import { describe, expect, it } from "vitest";
import {
  applyCommand,
  detectWikiLinkQuery,
  insertWikiLink,
  toggleLinePrefix,
  toggleNumberedList,
  toggleWrap,
  type TextState,
} from "./markdown-commands";

const st = (text: string, start = 0, end = start): TextState => ({
  text,
  selectionStart: start,
  selectionEnd: end,
});

describe("toggleWrap", () => {
  it("wraps a selection", () => {
    const r = toggleWrap(st("hello world", 0, 5), "**", "x");
    expect(r.text).toBe("**hello** world");
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe("hello");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const r = toggleWrap(st("", 0), "**", "bold text");
    expect(r.text).toBe("**bold text**");
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe("bold text");
  });

  it("unwraps when the selection includes the markers", () => {
    const r = toggleWrap(st("**hello**", 0, 9), "**", "x");
    expect(r.text).toBe("hello");
  });

  it("unwraps when markers sit just outside the selection", () => {
    const r = toggleWrap(st("**hello**", 2, 7), "**", "x");
    expect(r.text).toBe("hello");
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe("hello");
  });
});

describe("toggleLinePrefix", () => {
  it("adds a heading prefix", () => {
    expect(toggleLinePrefix(st("Title", 0), "## ").text).toBe("## Title");
  });

  it("removes the prefix when already present", () => {
    expect(toggleLinePrefix(st("## Title", 0), "## ").text).toBe("Title");
  });

  it("replaces a different heading level", () => {
    expect(toggleLinePrefix(st("## Title", 0), "### ").text).toBe("### Title");
  });

  it("applies across every selected line", () => {
    const text = "one\ntwo\nthree";
    const r = toggleLinePrefix(st(text, 0, text.length), "- ");
    expect(r.text).toBe("- one\n- two\n- three");
  });

  it("strips list markers when converting to a quote", () => {
    expect(toggleLinePrefix(st("- item", 0), "> ").text).toBe("> item");
  });

  it("only affects the lines the selection touches", () => {
    const text = "a\nb\nc";
    // Caret inside "b" only.
    const r = toggleLinePrefix(st(text, 2, 3), "- ");
    expect(r.text).toBe("a\n- b\nc");
  });
});

describe("toggleNumberedList", () => {
  it("numbers selected lines", () => {
    const text = "one\ntwo";
    expect(toggleNumberedList(st(text, 0, text.length)).text).toBe("1. one\n2. two");
  });

  it("removes numbering when already numbered", () => {
    const text = "1. one\n2. two";
    expect(toggleNumberedList(st(text, 0, text.length)).text).toBe("one\ntwo");
  });
});

describe("insertWikiLink", () => {
  it("inserts a plain wiki link at the caret", () => {
    const r = insertWikiLink(st("See ", 4), "Absalom");
    expect(r.text).toBe("See [[Absalom]]");
  });

  it("uses the selection as a display alias", () => {
    const r = insertWikiLink(st("See the city", 8, 12), "Absalom");
    expect(r.text).toBe("See the [[Absalom|city]]");
  });

  it("does not alias when the selection matches the title", () => {
    const r = insertWikiLink(st("Absalom", 0, 7), "Absalom");
    expect(r.text).toBe("[[Absalom]]");
  });
});

describe("applyCommand", () => {
  it("handles each command without throwing", () => {
    const commands = [
      "bold", "italic", "strikethrough", "code",
      "h1", "h2", "h3", "quote", "bulletList", "numberedList", "divider",
    ] as const;
    for (const c of commands) {
      const r = applyCommand(st("sample text", 0, 6), c);
      expect(typeof r.text).toBe("string");
      expect(r.text.length).toBeGreaterThan(0);
    }
  });

  it("bold and italic use different markers", () => {
    expect(applyCommand(st("x", 0, 1), "bold").text).toBe("**x**");
    expect(applyCommand(st("x", 0, 1), "italic").text).toBe("*x*");
  });
});

describe("detectWikiLinkQuery", () => {
  it("detects a partial link at the caret", () => {
    const text = "The city of [[Abs";
    const r = detectWikiLinkQuery(text, text.length);
    expect(r).toMatchObject({ query: "Abs", from: 12 });
  });

  it("returns an empty query right after the brackets", () => {
    const text = "go to [[";
    expect(detectWikiLinkQuery(text, text.length)?.query).toBe("");
  });

  it("returns null when the link is already closed", () => {
    const text = "see [[Absalom]] now";
    expect(detectWikiLinkQuery(text, text.length)).toBeNull();
  });

  it("returns null when there is no open bracket", () => {
    expect(detectWikiLinkQuery("plain text", 5)).toBeNull();
  });

  it("returns null across a newline", () => {
    const text = "[[start\nmore";
    expect(detectWikiLinkQuery(text, text.length)).toBeNull();
  });
});
