/**
 * Prompt construction for AI Assist.
 *
 * The point of generating lore *inside* FableKeeper rather than in a general
 * chat tool is that the world already exists here. So every request carries a
 * digest of the world's entries, and the model is told to reference them by
 * their exact titles — which the World Builder's `[[wiki link]]` syntax then
 * resolves into real links. A draft that invents a rival kingdom is worth much
 * less than one that ties into the kingdom the GM already wrote.
 *
 * Kept pure and separate from the API call so the prompt can be unit-tested,
 * and so the token budgeting below is verifiable without spending anything.
 */

import { ENTRY_TYPES } from "@/lib/world/entry-types";
import type { WorldEntryType } from "@/types/database";

/** One existing entry, as the model sees it. */
export interface ContextEntry {
  title: string;
  type: WorldEntryType;
  summary: string | null;
}

export interface PromptInput {
  worldName: string;
  entryType: WorldEntryType;
  brief: string;
  entries: readonly ContextEntry[];
}

/**
 * How much of the world to include.
 *
 * A mature campaign can hold hundreds of entries — an Azgaar import alone
 * produces 600+. Sending all of them would dominate the request and mostly
 * feed the model noise, so the digest is capped. Entries are already ordered
 * by relevance by the caller; this just takes the head.
 */
export const MAX_CONTEXT_ENTRIES = 60;
const MAX_SUMMARY_CHARS = 160;
export const MAX_BRIEF_CHARS = 2000;

export const SYSTEM_PROMPT = `You are a worldbuilding assistant for a Pathfinder 2nd Edition campaign, working inside the GM's own wiki.

Write in the voice of a well-edited campaign setting book: concrete, specific, and usable at the table. Prefer a named person, a specific grievance, or a particular smell over general description.

Rules:
- Reference existing entries by wrapping their exact title in double brackets, e.g. [[Karn Hollow]]. Only do this for titles listed as existing — never invent a bracketed link to something that does not exist.
- Write body content as markdown using \`##\` section headings. Do not include a top-level \`#\` title; the title is a separate field.
- Leave hooks and secrets as prompts for the GM rather than resolving them. You are giving them material to run, not a finished story.
- Do not invent Pathfinder rules text, stat blocks, or mechanical numbers. Describe things in fiction; the GM's other tools handle mechanics.
- Be concise. Three tight sections beat eight padded ones.`;

/** Compact one entry to a single line the model can scan. */
function line(entry: ContextEntry): string {
  const label = ENTRY_TYPES[entry.type]?.label ?? entry.type;
  const summary = entry.summary?.trim().replace(/\s+/g, " ") ?? "";
  const clipped =
    summary.length > MAX_SUMMARY_CHARS
      ? `${summary.slice(0, MAX_SUMMARY_CHARS).trimEnd()}…`
      : summary;
  return clipped ? `- ${entry.title} (${label}) — ${clipped}` : `- ${entry.title} (${label})`;
}

/**
 * Build the user message.
 *
 * Ordering matters for prompt caching: the system prompt is fixed and the world
 * digest changes only when the world does, so both sit ahead of the brief, which
 * changes on every request.
 */
export function buildUserPrompt(input: PromptInput): string {
  const label = ENTRY_TYPES[input.entryType]?.label ?? input.entryType;
  const included = input.entries.slice(0, MAX_CONTEXT_ENTRIES);

  const existing = included.length
    ? `Entries that already exist in ${input.worldName}. Reference these by exact title where they are genuinely relevant:\n\n${included
        .map(line)
        .join("\n")}`
    : `${input.worldName} has no entries yet, so there is nothing to link to. Write something self-contained that leaves room for the world to grow around it.`;

  const truncated =
    input.entries.length > included.length
      ? `\n\n(${input.entries.length - included.length} further entries exist but are not listed.)`
      : "";

  return `${existing}${truncated}

---

Write a new **${label}** entry for ${input.worldName}.

The GM's brief:
${input.brief.trim().slice(0, MAX_BRIEF_CHARS)}`;
}

/** The shape the model must return, enforced with structured outputs. */
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The entry's name. No article, no type suffix — just the name.",
    },
    summary: {
      type: "string",
      description: "One sentence, under 200 characters, for list views.",
    },
    markdown: {
      type: "string",
      description:
        "The body, as markdown with ## section headings. No top-level # title.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Three to six short lowercase tags.",
    },
  },
  required: ["title", "summary", "markdown", "tags"],
  additionalProperties: false,
} as const;

export interface EntryDraft {
  title: string;
  summary: string;
  markdown: string;
  tags: string[];
}

/**
 * Validate and clean a model response.
 *
 * Structured outputs make the shape reliable, not the *content* — so lengths are
 * clamped and tags normalised here rather than trusting what comes back.
 */
export function normaliseDraft(value: unknown): EntryDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const markdown = typeof raw.markdown === "string" ? raw.markdown.trim() : "";
  if (!title || !markdown) return null;

  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const tags = Array.isArray(raw.tags)
    ? [
        ...new Set(
          raw.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .map((t) => t.slice(0, 40)),
        ),
      ].slice(0, 8)
    : [];

  return {
    title: title.slice(0, 120),
    summary: summary.slice(0, 300),
    markdown,
    tags,
  };
}
