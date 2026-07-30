"use server";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ALL_ENTRY_TYPES } from "@/lib/world/entry-types";
import {
  buildUserPrompt,
  DRAFT_SCHEMA,
  MAX_BRIEF_CHARS,
  MAX_CONTEXT_ENTRIES,
  normaliseDraft,
  SYSTEM_PROMPT,
  type ContextEntry,
  type EntryDraft,
} from "./prompt";
import { isUsableFinish, messageForBlock, messageForStatus } from "./errors";
import type { WorldEntryType } from "@/types/database";

export interface AssistState {
  error?: string;
  draft?: EntryDraft;
  /** Echoed back so the form can keep the chosen type when saving. */
  entryType?: WorldEntryType;
}

const schema = z.object({
  campaignId: z.string().uuid(),
  worldId: z.string().uuid(),
  entryType: z.enum(ALL_ENTRY_TYPES as unknown as [string, ...string[]]),
  brief: z.string().trim().min(10, "Give the assistant a sentence or two to work from.")
    .max(MAX_BRIEF_CHARS),
});

/**
 * The model to generate with.
 *
 * Gemini 2.5 Flash is the pick because it is the strongest model with a real
 * free tier: good enough prose for setting-book copy, native structured
 * outputs, and no card on file. Deliberately a *stable* id rather than a
 * `-preview` one — preview models are withdrawn on Google's schedule, and a
 * campaign wiki shouldn't lose a feature because an alias retired.
 */
const MODEL = "gemini-2.5-flash";

/**
 * Free-tier quota is small and shared across the whole deployment, so an
 * unbounded response costs more here than it would on a paid key. Cap the
 * output rather than letting a rambling brief pull a novel.
 */
const MAX_OUTPUT_TOKENS = 8192;

export async function generateEntryDraft(
  _prev: AssistState,
  formData: FormData,
): Promise<AssistState> {
  const parsed = schema.safeParse({
    campaignId: formData.get("campaignId"),
    worldId: formData.get("worldId"),
    entryType: formData.get("entryType"),
    brief: formData.get("brief") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const entryType = parsed.data.entryType as WorldEntryType;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      error:
        "AI Assist isn't configured. Add a GEMINI_API_KEY secret to the Worker and redeploy.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // RLS scopes this to what the signed-in user may read, so a Player's draft is
  // grounded only in the parts of the world the GM has actually revealed.
  const { data: world } = await supabase
    .from("worlds")
    .select("id, name, campaign_id")
    .eq("id", parsed.data.worldId)
    .maybeSingle();
  if (!world || world.campaign_id !== parsed.data.campaignId) {
    return { error: "That world is not part of this campaign." };
  }

  const { data: rows } = await supabase
    .from("world_entries")
    .select("title, type, summary")
    .eq("world_id", parsed.data.worldId)
    // Newest first: what the GM touched most recently is the likeliest to be
    // what they're building around now.
    .order("updated_at", { ascending: false })
    .limit(MAX_CONTEXT_ENTRIES);
  const entries: ContextEntry[] = rows ?? [];

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildUserPrompt({
        worldName: world.name,
        entryType,
        brief: parsed.data.brief,
        entries,
      }),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Prose, not extraction — the default temperature gives the variety
        // that makes two NPCs from similar briefs read as different people.
        temperature: 1,
        responseMimeType: "application/json",
        responseJsonSchema: DRAFT_SCHEMA,
      },
    });

    // Check both places a generation can stop before touching the text. A
    // blocked prompt never produced any, and a non-STOP finish means what is
    // there is truncated — reading either would surface as a parse error that
    // tells the GM nothing about what actually happened.
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      return { error: messageForBlock(blockReason, "prompt") };
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (!isUsableFinish(finishReason)) {
      return { error: messageForBlock(finishReason, "response") };
    }

    const text = response.text;
    if (!text) return { error: "The assistant returned nothing. Try again." };

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { error: "The assistant's reply couldn't be read. Try again." };
    }

    const draft = normaliseDraft(payload);
    if (!draft) return { error: "The assistant's reply was incomplete. Try again." };

    return { draft, entryType };
  } catch (err) {
    // The SDK throws ApiError with the HTTP status attached and the raw error
    // body as the message; an error carrying neither never reached the API.
    const api = err as { status?: unknown; message?: unknown };
    const status = typeof api?.status === "number" ? api.status : Number(api?.status);
    const detail = typeof api?.message === "string" ? api.message : undefined;
    return {
      error: Number.isFinite(status)
        ? messageForStatus(status, detail)
        : "Couldn't reach the Gemini API. Check the Worker's network access.",
    };
  }
}

/** Whether the deployment has a key configured, for the UI's empty state. */
export async function isAiConfigured(): Promise<boolean> {
  return Boolean(process.env.GEMINI_API_KEY);
}
