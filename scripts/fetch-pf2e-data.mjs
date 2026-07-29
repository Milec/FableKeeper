#!/usr/bin/env node
/**
 * PF2E data ingestion.
 *
 * Builds the bundled PF2E datasets (bestiary + rollable tables) from the
 * community-maintained Pf2eTools data set, which mirrors Paizo's published
 * mechanical content.
 *
 * Run with: npm run data:pf2e
 *
 * ---------------------------------------------------------------------------
 * LICENSING
 * ---------------------------------------------------------------------------
 * Only sources whose *mechanical* content is released under an open licence
 * (OGL 1.0a for pre-remaster hardcovers, ORC for the remaster) are ingested.
 * Adventure Paths, card decks (Critical Hit/Fumble/Hero Point), and other
 * closed products are deliberately excluded — see OPEN_SOURCES below. Creature
 * entries keep only the numbers a GM needs to build an encounter (name, level,
 * traits, size, rarity, source + page for attribution); no descriptive or
 * narrative text is copied.
 *
 * This keeps FableKeeper's use limited to game mechanics plus attribution,
 * consistent with Paizo's Community Use Policy. Pathfinder is a trademark of
 * Paizo Inc.; FableKeeper is unofficial and unaffiliated.
 */

import fs from "node:fs/promises";
import path from "node:path";

const RAW = "https://raw.githubusercontent.com/Pf2eToolsOrg/Pf2eTools/master/data";
const OUT_DIR = path.join(process.cwd(), "src/data/pf2e");

/**
 * Source abbreviations whose mechanics are open content, mapped to a readable
 * label used for attribution in the UI.
 */
const OPEN_SOURCES = {
  // Remaster (ORC)
  PC1: "Player Core",
  PC2: "Player Core 2",
  GMC: "GM Core",
  MC: "Monster Core",
  // Pre-remaster hardcovers (OGL 1.0a)
  CRB: "Core Rulebook",
  GMG: "Gamemastery Guide",
  APG: "Advanced Player's Guide",
  B1: "Bestiary",
  B2: "Bestiary 2",
  B3: "Bestiary 3",
  SoM: "Secrets of Magic",
  "G&G": "Guns & Guns",
  DA: "Dark Archive",
  TV: "Treasure Vault",
  RoE: "Rage of Elements",
  BotD: "Book of the Dead",
};

/** Bestiary files to ingest (core monster books only). */
const BESTIARY_FILES = [
  "creatures-b1.json",
  "creatures-b2.json",
  "creatures-b3.json",
  "creatures-crb.json",
  "creatures-gmg.json",
];

// --- Pf2eTools markup ------------------------------------------------------
// Text uses 5etools-style tags: {@b bold}, {@item Name|SRC},
// {@dice 1d8|display}, {@trait fire}, {@action Craft}, {@scaledice ...}.
// Reduce each to its human-readable display text.
function stripMarkup(input) {
  if (typeof input !== "string") return "";
  let out = input;
  // Repeatedly collapse innermost {@tag ...} groups so nesting resolves.
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/\{@(\w+)\s+([^{}]*)\}/g, (_m, tag, body) => {
      const parts = body.split("|");
      if (parts.length >= 3) return parts[2].trim();
      if (parts.length === 2) {
        // For dice-ish tags the 2nd part is a display override; for links
        // (item/spell/creature) the 2nd part is the source book.
        return /^(dice|scaledice|damage|hit|dc|chance)$/i.test(tag)
          ? parts[1].trim()
          : parts[0].trim();
      }
      return parts[0].trim();
    });
    if (next === out) break;
    out = next;
  }
  // Any leftover bare tags (e.g. {@atk}) and stray braces.
  return out
    .replace(/\{@\w+\}/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- Traits ----------------------------------------------------------------
const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const RARITIES = ["common", "uncommon", "rare", "unique"];
// Alignment abbreviations that appear as traits pre-remaster.
const ALIGNMENTS = new Set(["lg", "ng", "cg", "ln", "n", "cn", "le", "ne", "ce", "any"]);

/**
 * The PF2E "creature type" traits — the ones a GM filters an encounter by.
 * Anything else (fire, incorporeal, goblin, …) stays as a general trait.
 */
const CREATURE_TYPES = new Set([
  "aberration", "animal", "astral", "beast", "celestial", "construct", "dragon",
  "dream", "elemental", "ethereal", "fey", "fiend", "fungus", "giant", "humanoid",
  "monitor", "ooze", "plant", "spirit", "undead", "shade", "time", "petitioner",
  "aeon", "angel", "archon", "azata", "demon", "devil", "daemon", "dinosaur",
  "duskwalker", "genie", "hag", "inevitable", "kaiju", "nymph", "protean",
  "psychopomp", "sprite", "troll", "velstrac", "zombie", "skeleton", "golem",
  "mummy", "vampire", "werecreature", "swarm", "amphibious", "aquatic",
]);

async function buildBestiary() {
  const creatures = [];
  const seen = new Set();

  for (const file of BESTIARY_FILES) {
    let data;
    try {
      data = await getJson(`${RAW}/bestiary/${file}`);
    } catch (err) {
      console.warn(`  ! skipped ${file}: ${err.message}`);
      continue;
    }
    for (const c of data.creature ?? []) {
      if (!OPEN_SOURCES[c.source]) continue;
      if (typeof c.level !== "number" || !c.name) continue;

      const traits = (c.traits ?? []).map((t) => String(t).toLowerCase());
      const size = traits.find((t) => SIZES.includes(t)) ?? "medium";
      const rarity = traits.find((t) => RARITIES.includes(t)) ?? "common";
      const types = traits.filter((t) => CREATURE_TYPES.has(t));
      // Descriptive traits: drop size/rarity/alignment/type bookkeeping.
      const rest = traits.filter(
        (t) =>
          !SIZES.includes(t) &&
          !RARITIES.includes(t) &&
          !ALIGNMENTS.has(t) &&
          !CREATURE_TYPES.has(t),
      );

      const key = `${c.name.toLowerCase()}|${c.source}`;
      if (seen.has(key)) continue;
      seen.add(key);

      creatures.push({
        name: c.name,
        level: c.level,
        size,
        rarity,
        types: types.length ? types : ["creature"],
        traits: rest,
        source: c.source,
        page: typeof c.page === "number" ? c.page : undefined,
      });
    }
  }

  creatures.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return creatures;
}

// --- Rollable tables -------------------------------------------------------
const RANGE_RE = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/;

/** Parse a first-column cell like "1", "3–5", "01-10" into [min,max]. */
function parseRange(cell) {
  const m = RANGE_RE.exec(stripMarkup(String(cell)));
  if (!m) return null;
  const min = Number.parseInt(m[1], 10);
  const max = m[2] ? Number.parseInt(m[2], 10) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return [min, max];
}

/** A few table names are printed in all caps; render them as Title Case. */
function tidyName(name) {
  const trimmed = String(name).trim();
  if (trimmed !== trimmed.toUpperCase() || !/[A-Z]{4,}/.test(trimmed)) {
    return trimmed;
  }
  const minor = new Set(["by", "of", "the", "and", "a", "an", "to", "per", "or"]);
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && minor.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function buildTables(raw) {
  const out = [];

  for (const t of raw.table ?? []) {
    if (!OPEN_SOURCES[t.source]) continue;
    const rows = t.rows ?? [];
    if (rows.length < 3) continue;

    // Header is the label row (default row 0).
    const labelIdx = typeof t.labelRowIdx === "number" ? t.labelRowIdx : 0;
    const header = rows[labelIdx] ?? [];
    const body = rows.filter((_, i) => i !== labelIdx);

    // A table is rollable when its first column is a contiguous set of numeric
    // ranges starting at 1 — i.e. it really is "roll a die and read across".
    const parsed = body.map((r) => parseRange(Array.isArray(r) ? r[0] : r));
    const usable = parsed.filter(Boolean);
    if (usable.length < 2 || usable.length / body.length < 0.9) continue;
    if (usable[0][0] !== 1) continue;

    // Ranges must not overlap and should be ascending.
    let ok = true;
    let cursor = 0;
    for (const [min, max] of usable) {
      if (min !== cursor + 1) { ok = false; break; }
      cursor = max;
    }
    if (!ok) continue;

    const entries = [];
    body.forEach((row, i) => {
      const range = parsed[i];
      if (!range) return;
      const cells = Array.isArray(row) ? row.slice(1) : [];
      const text = cells.map((c) => stripMarkup(String(c))).filter(Boolean).join(" — ");
      if (!text) return;
      entries.push({ weight: range[1] - range[0] + 1, text });
    });
    if (entries.length < 2) continue;

    const dieLabel = stripMarkup(String(header[0] ?? "")) || `d${cursor}`;

    // Distinguish a true roll table ("roll d20 and read across") from a
    // level/score lookup table, which has the same ascending-integer shape but
    // is indexed rather than rolled. Only a dice-shaped header column — or the
    // upstream `rollable` flag — makes it rollable.
    const diceHeader = /^\s*\d*\s*d\s*(\d+|%)\s*$/i.test(dieLabel) || /roll/i.test(dieLabel);
    const kind = diceHeader || t.rollable === true ? "rollable" : "reference";

    out.push({
      id: `${t.source}-${t.name}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      name: t.name,
      kind,
      category: OPEN_SOURCES[t.source],
      source: t.source,
      page: typeof t.page === "number" ? t.page : undefined,
      die: dieLabel,
      columns: (header.slice(1) ?? []).map((h) => stripMarkup(String(h))).filter(Boolean),
      entries,
    });
  }

  // Deduplicate. Some tables appear in both a legacy book and its remaster
  // reprint (e.g. Formulas in CRB and Player Core); keep the remaster version.
  const REMASTER = new Set(["PC1", "PC2", "GMC", "MC"]);
  const byName = new Map();
  for (const t of out) {
    const key = `${t.kind}|${t.name.trim().toLowerCase()}`;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, t);
      continue;
    }
    const better =
      REMASTER.has(t.source) && !REMASTER.has(existing.source) ? t : existing;
    byName.set(key, better);
  }

  return [...byName.values()]
    .map((t) => ({ ...t, name: tidyName(t.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching bestiary…");
  const creatures = await buildBestiary();
  console.log(`  ${creatures.length} creatures`);

  console.log("Fetching tables…");
  const rawTables = await getJson(`${RAW}/tables.json`);
  const tables = buildTables(rawTables);
  console.log(`  ${tables.length} rollable tables`);

  const meta = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "Pf2eTools (github.com/Pf2eToolsOrg/Pf2eTools)",
    note:
      "Mechanical PF2E content from open-licensed sources (OGL 1.0a / ORC). " +
      "Pathfinder is a trademark of Paizo Inc. FableKeeper is unofficial.",
    sources: OPEN_SOURCES,
  };

  await fs.writeFile(
    path.join(OUT_DIR, "bestiary.json"),
    JSON.stringify({ meta, creatures }, null, 0) + "\n",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "tables.json"),
    JSON.stringify({ meta, tables }, null, 0) + "\n",
  );

  console.log(`\nWrote ${OUT_DIR}/bestiary.json and tables.json`);
  const levels = [...new Set(creatures.map((c) => c.level))].sort((a, b) => a - b);
  console.log(`Levels ${levels[0]}..${levels[levels.length - 1]}`);
  for (const kind of ["rollable", "reference"]) {
    const group = tables.filter((t) => t.kind === kind);
    console.log(`\n${kind.toUpperCase()} (${group.length}):`);
    for (const t of group) {
      console.log(`  ${t.die.padEnd(14)} ${String(t.entries.length).padStart(3)} rows  ${t.name} [${t.source}]`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
