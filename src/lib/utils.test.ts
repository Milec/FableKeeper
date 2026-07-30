import { describe, expect, it } from "vitest";
import { greetingName, slugify } from "./utils";

describe("greetingName", () => {
  it("prefers an explicit display name", () => {
    expect(greetingName("Ada", "someone@example.com")).toBe("Ada");
    expect(greetingName("  Ada Lovelace  ", null)).toBe("Ada Lovelace");
  });

  it("tidies an email local part rather than showing it raw", () => {
    // A raw local part reads badly in a large display-font heading.
    expect(greetingName(null, "ada.lovelace3@example.com")).toBe("Ada Lovelace");
    expect(greetingName(null, "ada_lovelace@example.com")).toBe("Ada Lovelace");
    expect(greetingName(null, "ada-lovelace@example.com")).toBe("Ada Lovelace");
    expect(greetingName(null, "ada+tag@example.com")).toBe("Ada Tag");
  });

  it("stops at two words, since more is an address not a name", () => {
    expect(greetingName(null, "ada.b.c.lovelace@example.com")).toBe("Ada B");
  });

  it("falls back when there is nothing usable", () => {
    expect(greetingName(null, null)).toBe("Keeper");
    expect(greetingName("", "")).toBe("Keeper");
    expect(greetingName(undefined, "123@example.com")).toBe("Keeper");
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Karn Hollow")).toBe("karn-hollow");
    expect(slugify("  The King's Road!  ")).toBe("the-kings-road");
    expect(slugify("Ashspine   Range")).toBe("ashspine-range");
    expect(slugify("!!!")).toBe("");
  });
});
