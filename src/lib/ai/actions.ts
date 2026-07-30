"use server";

import Anthropic from "@anthropic-ai/sdk";
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

/** The model to generate with. Opus for prose quality — this is the deliverable. */
const MODEL = "claude-opus-5";

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "AI Assist isn't configured. Add an ANTHROPIC_API_KEY secret to the Worker and redeploy.",
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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // The system prompt is fixed, so it caches across every request.
          cache_control: { type: "ephemeral" },
        },
      ],
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: DRAFT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            worldName: world.name,
            entryType,
            brief: parsed.data.brief,
            entries,
          }),
        },
      ],
    });

    // Check the stop reason before touching content: a refused response carries
    // no usable body, and indexing into it would throw rather than explain.
    if (response.stop_reason === "refusal") {
      return {
        error:
          "The assistant declined to write that. Try rewording the brief, or write this entry by hand.",
      };
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return { error: "The assistant returned nothing. Try again." };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text.text);
    } catch {
      return { error: "The assistant's reply couldn't be read. Try again." };
    }

    const draft = normaliseDraft(payload);
    if (!draft) return { error: "The assistant's reply was incomplete. Try again." };

    return { draft, entryType };
  } catch (err) {
    // Typed SDK errors, most specific first — a bad key and a rate limit need
    // very different things from the person reading the message.
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: "The configured ANTHROPIC_API_KEY was rejected." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { error: "Rate limited by the API. Wait a moment and try again." };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { error: "Couldn't reach the API. Check the Worker's network access." };
    }
    if (err instanceof Anthropic.APIError) {
      return { error: `The API returned an error (${err.status}).` };
    }
    return { error: "Something went wrong generating that draft." };
  }
}

/** Whether the deployment has a key configured, for the UI's empty state. */
export async function isAiConfigured(): Promise<boolean> {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
