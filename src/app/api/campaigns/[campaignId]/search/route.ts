import { NextResponse } from "next/server";
import { searchEntries } from "@/lib/world/queries";
import { entryTypeMeta } from "@/lib/world/entry-types";

/**
 * Typeahead search endpoint for the command palette. RLS scopes results to
 * entries the caller may see, so this never leaks GM secrets to players.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const entries = await searchEntries(campaignId, q, 20);
  const results = entries.map((e) => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    type: e.type,
    typeLabel: entryTypeMeta(e.type).label,
    worldId: e.world_id,
    isSecret: e.is_secret,
    href: `/campaigns/${campaignId}/worlds/${e.world_id}/entries/${e.id}`,
  }));

  return NextResponse.json({ results });
}
