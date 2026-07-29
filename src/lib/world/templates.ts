import type { WorldEntryType } from "@/types/database";

/**
 * Guided starter templates per entry type.
 *
 * Inspired by MythScribe's prompted worldbuilding flow: rather than dropping the
 * GM into an empty box, a new entry opens with the questions worth answering for
 * that kind of thing. Templates are plain markdown headings and italic prompts,
 * so they're editable, deletable, and render fine if left in place.
 */

const SETTLEMENT = [
  "## Overview",
  "*What does a visitor notice first?*",
  "",
  "## Government & Power",
  "*Who rules, and who really holds power?*",
  "",
  "## Economy & Trade",
  "*What does it make, need, and sell?*",
  "",
  "## Districts & Landmarks",
  "*Where would the party actually go?*",
  "",
  "## Notable Figures",
  "*Link NPCs with [[Name]].*",
  "",
  "## Troubles & Hooks",
  "*What's going wrong here right now?*",
].join("\n");

const REGION = [
  "## Overview",
  "*Geography, climate, and what makes it distinct.*",
  "",
  "## Peoples & Cultures",
  "",
  "## Settlements",
  "*Link with [[Name]].*",
  "",
  "## Dangers",
  "*Creatures, hazards, and lawless places.*",
  "",
  "## Hooks",
].join("\n");

const ORGANISATION = [
  "## Purpose",
  "*What does it exist to do?*",
  "",
  "## Structure & Ranks",
  "",
  "## Members",
  "*Link NPCs with [[Name]].*",
  "",
  "## Resources & Reach",
  "",
  "## Rivals & Allies",
  "",
  "## Secrets",
  "*Mark the entry as a GM secret if this shouldn't be public.*",
].join("\n");

const NPC = [
  "## At a Glance",
  "*One line you could say at the table.*",
  "",
  "## Appearance & Manner",
  "",
  "## Motivation",
  "*What do they want, and what will they trade for it?*",
  "",
  "## Relationships",
  "*Link with [[Name]].*",
  "",
  "## Secrets",
  "",
  "## Hooks",
].join("\n");

const CREATURE = [
  "## Description",
  "",
  "## Behaviour & Tactics",
  "",
  "## Habitat",
  "",
  "## Stat Block",
  "*Level, traits, and where to find the numbers.*",
  "",
  "## Lore",
].join("\n");

const DEITY = [
  "## Domain & Portfolio",
  "",
  "## Tenets",
  "",
  "## Followers & Clergy",
  "",
  "## Temples & Rites",
  "",
  "## Symbols & Omens",
].join("\n");

const SITE = [
  "## Overview",
  "*What it looks like on approach.*",
  "",
  "## History",
  "*Who built it, and what happened here?*",
  "",
  "## Layout",
  "*Key areas the party will move through.*",
  "",
  "## Inhabitants & Hazards",
  "",
  "## Treasure & Secrets",
  "",
  "## Hooks",
].join("\n");

const EVENT = [
  "## What Happened",
  "",
  "## When",
  "*Date on your campaign calendar.*",
  "",
  "## Who Was Involved",
  "*Link with [[Name]].*",
  "",
  "## Consequences",
  "*How does the world still feel this?*",
].join("\n");

const CULTURE = [
  "## Overview",
  "",
  "## Values & Taboos",
  "",
  "## Daily Life",
  "",
  "## Dress & Craft",
  "",
  "## Rites & Festivals",
].join("\n");

const ITEM = [
  "## Description",
  "",
  "## Powers",
  "*Mechanics, rarity, and level.*",
  "",
  "## History",
  "*Who made it, who carried it, who wants it.*",
  "",
  "## Hooks",
].join("\n");

const GENERIC = [
  "## Overview",
  "",
  "## Details",
  "",
  "## Hooks",
  "*Link related entries with [[Name]].*",
].join("\n");

/** Markdown scaffold for a new entry of the given type. */
const TEMPLATES: Partial<Record<WorldEntryType, string>> = {
  world: REGION,
  continent: REGION,
  region: REGION,
  nation: REGION,
  kingdom: REGION,
  province: REGION,
  city: SETTLEMENT,
  village: SETTLEMENT,
  landmark: SITE,
  dungeon: SITE,
  ruin: SITE,
  organization: ORGANISATION,
  noble_house: ORGANISATION,
  guild: ORGANISATION,
  religion: DEITY,
  pantheon: DEITY,
  culture: CULTURE,
  language: CULTURE,
  historical_event: EVENT,
  npc: NPC,
  monster: CREATURE,
  item: ITEM,
  book: ITEM,
};

export function templateFor(type: WorldEntryType): string {
  return TEMPLATES[type] ?? GENERIC;
}

/** Types that have a bespoke (non-generic) template. */
export function hasTemplate(type: WorldEntryType): boolean {
  return type in TEMPLATES;
}
