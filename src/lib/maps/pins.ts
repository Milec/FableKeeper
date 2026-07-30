/**
 * Turns an Azgaar map's placed objects into map pins.
 *
 * Azgaar records burg and marker positions in the **pixel space of the map it
 * generated** — `info.width` × `info.height`, commonly 1680×849. The image a GM
 * exports is usually a different size entirely (Azgaar will export the same
 * world at 8000×4045 if you ask it to), and they may later swap in a
 * hand-tidied version.
 *
 * So pins are stored as fractions of the image, 0–1 on each axis. That makes
 * them resolution-independent: the viewer positions each pin with a percentage
 * and never needs to know what the source map measured.
 */

import type { AzgaarMap } from "./azgaar";
import { entryTypeForBurg, entryTypeForMarker, type EntryDraft } from "./entries";

export interface PinDraft {
  label: string;
  /** Drives the icon: the entry type for settlements and marker sites. */
  kind: string;
  /** 0–1 across the image. */
  x: number;
  /** 0–1 down the image. */
  y: number;
  /** Slug of the world entry this pin opens, when one was imported. */
  entrySlug: string | null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export interface PinOptions {
  /** Skip settlements below this population. Capitals are always kept. */
  minBurgPopulation?: number;
  /** Include markers (volcanoes, ruins, caves…) as well as settlements. */
  includeMarkers?: boolean;
}

/**
 * Build pins for every placed object on the map.
 *
 * `drafts` is the output of `buildEntryDrafts` for the same map. Pins resolve to
 * articles through it rather than by re-slugifying the name, because the draft
 * builder de-duplicates collisions: Azgaar names a province after its seat burg,
 * so the burg "Longong" may hold `longong-2` while the province holds `longong`.
 * Re-deriving the slug here would point the city's pin at the province's article.
 *
 * Returns an empty list when the export doesn't declare its own dimensions,
 * rather than guessing — a wrong denominator puts every pin in the wrong place,
 * which is worse than showing none.
 */
export function buildPinDrafts(
  map: AzgaarMap,
  drafts: readonly EntryDraft[],
  options: PinOptions = {},
): PinDraft[] {
  const width = map.info.width;
  const height = map.info.height;
  if (!width || !height || width <= 0 || height <= 0) return [];

  /** Resolved slugs, keyed by the group and title that produced them. */
  const slugFor = new Map<string, string>();
  for (const draft of drafts) {
    const key = `${draft.group}:${draft.title}`;
    if (!slugFor.has(key)) slugFor.set(key, draft.slug);
  }

  const minPop = options.minBurgPopulation ?? 0;
  const pins: PinDraft[] = [];

  for (const burg of map.burgs) {
    if (burg.x === null || burg.y === null) continue;
    if (!burg.isCapital && (burg.population ?? 0) < minPop) continue;
    pins.push({
      label: burg.name,
      kind: entryTypeForBurg(burg),
      x: clamp01(burg.x / width),
      y: clamp01(burg.y / height),
      entrySlug: slugFor.get(`burgs:${burg.name}`) ?? null,
    });
  }

  if (options.includeMarkers !== false) {
    for (const marker of map.markers) {
      if (marker.x === null || marker.y === null) continue;
      // A marker's name lives in the map notes, not on the marker itself.
      const label = marker.name ?? map.notes.get(`marker${marker.id}`)?.name ?? null;
      if (!label) continue;
      pins.push({
        label,
        kind: entryTypeForMarker(marker),
        x: clamp01(marker.x / width),
        y: clamp01(marker.y / height),
        entrySlug: slugFor.get(`markers:${label}`) ?? null,
      });
    }
  }

  return pins;
}
