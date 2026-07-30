import { describe, expect, it } from "vitest";
import {
  buildUserPrompt,
  MAX_CONTEXT_ENTRIES,
  normaliseDraft,
  SYSTEM_PROMPT,
  type ContextEntry,
} from "./prompt";

const entries: ContextEntry[] = [
  { title: "Valdoria", type: "kingdom", summary: "A mountain kingdom." },
  { title: "Karn Hollow", type: "city", summary: "The capital, carved into a cliff." },
  { title: "Redmarsh", type: "town", summary: null },
];

describe("buildUserPrompt", () => {
  const prompt = buildUserPrompt({
    worldName: "Aventhar",
    entryType: "npc",
    brief: "A smuggler who works the marsh routes.",
    entries,
  });

  it("names the world and the entry type being written", () => {
    expect(prompt).toContain("Aventhar");
    expect(prompt).toContain("Write a new **NPC** entry");
  });

  it("lists existing entries by exact title, so links can resolve", () => {
    // The model links by title; a paraphrased title produces a dead wiki link.
    expect(prompt).toContain("- Valdoria (Kingdom) — A mountain kingdom.");
    expect(prompt).toContain("- Karn Hollow (City) — The capital, carved into a cliff.");
  });

  it("handles an entry with no summary without leaving a dangling dash", () => {
    expect(prompt).toContain("- Redmarsh (Town)\n");
    expect(prompt).not.toContain("Redmarsh (Town) —");
  });

  it("carries the brief through", () => {
    expect(prompt).toContain("A smuggler who works the marsh routes.");
  });

  it("caps the digest and says how much was left out", () => {
    // A mature campaign can hold hundreds of entries; an Azgaar import alone
    // produces 600+. Sending them all would drown the brief.
    const many: ContextEntry[] = Array.from({ length: 200 }, (_, i) => ({
      title: `Place ${i}`,
      type: "landmark" as const,
      summary: "Somewhere.",
    }));
    const big = buildUserPrompt({
      worldName: "Aventhar",
      entryType: "landmark",
      brief: "A shrine.",
      entries: many,
    });
    expect(big).toContain("Place 0");
    expect(big).not.toContain(`Place ${MAX_CONTEXT_ENTRIES}`);
    expect(big).toContain(`(${200 - MAX_CONTEXT_ENTRIES} further entries exist`);
  });

  it("truncates a long summary rather than letting one entry dominate", () => {
    const wordy = buildUserPrompt({
      worldName: "Aventhar",
      entryType: "npc",
      brief: "Someone.",
      entries: [{ title: "Long", type: "npc", summary: "x".repeat(500) }],
    });
    expect(wordy).toContain("…");
    expect(wordy.length).toBeLessThan(600);
  });

  it("tells the model there is nothing to link to in an empty world", () => {
    const empty = buildUserPrompt({
      worldName: "Blank",
      entryType: "city",
      brief: "A port.",
      entries: [],
    });
    expect(empty).toContain("has no entries yet");
    // Inviting links into an empty world would produce dead brackets.
    expect(empty).not.toContain("Reference these by exact title");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("forbids inventing links and inventing rules", () => {
    expect(SYSTEM_PROMPT).toContain("never invent a bracketed link");
    expect(SYSTEM_PROMPT).toContain("Do not invent Pathfinder rules text");
  });
});

describe("normaliseDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(
      normaliseDraft({
        title: "  Sera Vance  ",
        summary: " A champion. ",
        markdown: "## Overview\n\nShe serves [[Valdoria]].",
        tags: ["NPC", "champion"],
      }),
    ).toEqual({
      title: "Sera Vance",
      summary: "A champion.",
      markdown: "## Overview\n\nShe serves [[Valdoria]].",
      tags: ["npc", "champion"],
    });
  });

  it("rejects a draft with no title or no body", () => {
    // Structured outputs guarantee the shape, not that the fields are useful.
    expect(normaliseDraft({ title: "", markdown: "## Hi" })).toBeNull();
    expect(normaliseDraft({ title: "Name", markdown: "   " })).toBeNull();
    expect(normaliseDraft(null)).toBeNull();
    expect(normaliseDraft("nope")).toBeNull();
  });

  it("de-duplicates and bounds tags", () => {
    const draft = normaliseDraft({
      title: "T",
      markdown: "## X",
      summary: "",
      tags: ["City", "city", " CITY ", "", 42, ...Array(20).fill("filler")],
    })!;
    expect(draft.tags.slice(0, 2)).toEqual(["city", "filler"]);
    expect(draft.tags.length).toBeLessThanOrEqual(8);
  });

  it("clamps overlong fields", () => {
    const draft = normaliseDraft({
      title: "x".repeat(500),
      summary: "y".repeat(900),
      markdown: "## Body",
      tags: [],
    })!;
    expect(draft.title).toHaveLength(120);
    expect(draft.summary).toHaveLength(300);
  });
});
