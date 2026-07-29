/**
 * Obsidian-style wiki links for World Builder entries.
 *
 * Authors write `[[Entry Title]]` (or `[[Entry Title|display text]]`) inside an
 * entry's markdown. This module extracts those references (so we can sync the
 * `entry_links` table for backlinks) and rewrites them into standard markdown
 * links for rendering. It is pure and dependency-free so it can be unit tested
 * and reused on both server and client.
 */

import { slugify } from "@/lib/utils";

/** A single parsed wiki link. */
export interface WikiLink {
  /** The target entry's title as written, e.g. "Absalom". */
  target: string;
  /** Slug derived from the target, matching `world_entries.slug`. */
  slug: string;
  /** Optional display alias (the part after `|`). */
  alias?: string;
}

// [[Target]] or [[Target|Alias]] — target/alias may contain spaces but not
// square brackets or pipes.
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Extract every wiki link from a body of text, de-duplicated by slug. */
export function extractWikiLinks(text: string): WikiLink[] {
  const seen = new Map<string, WikiLink>();
  for (const match of text.matchAll(WIKILINK_RE)) {
    const target = match[1]!.trim();
    if (!target) continue;
    const alias = match[2]?.trim();
    const slug = slugify(target);
    if (!slug) continue;
    if (!seen.has(slug)) {
      seen.set(slug, { target, slug, ...(alias ? { alias } : {}) });
    }
  }
  return [...seen.values()];
}

/**
 * Rewrite `[[wiki links]]` into markdown links.
 *
 * @param text     The raw markdown containing wiki links.
 * @param resolve  Maps a slug to a URL. Return `null`/`undefined` for an
 *                 unresolved target, which is rendered as a distinct "missing
 *                 link" so authors can spot dangling references.
 */
export function renderWikiLinks(
  text: string,
  resolve: (slug: string, target: string) => string | null | undefined,
): string {
  return text.replace(WIKILINK_RE, (_full, rawTarget: string, rawAlias?: string) => {
    const target = rawTarget.trim();
    const alias = rawAlias?.trim();
    const label = alias || target;
    const href = resolve(slugify(target), target);
    if (!href) {
      // Unresolved: render as a link to create, marked with a title so the UI
      // can style dangling links.
      return `[${label}](## "missing:${slugify(target)}")`;
    }
    return `[${label}](${href})`;
  });
}
