import type { WikiResolver } from "@/components/world/entry-content";
import type { EntryRef } from "@/lib/world/queries";

/**
 * Build the slug → URL map the markdown renderer uses to resolve `[[wiki
 * links]]` within a world, plus a template for creating missing entries.
 */
export function buildWikiResolver(
  campaignId: string,
  worldId: string,
  refs: EntryRef[],
): WikiResolver {
  const base = `/campaigns/${campaignId}/worlds/${worldId}/entries`;
  const hrefBySlug: Record<string, string> = {};
  for (const ref of refs) {
    hrefBySlug[ref.slug] = `${base}/${ref.id}`;
  }
  return {
    hrefBySlug,
    createHref: `${base}/new?title={slug}`,
  };
}
