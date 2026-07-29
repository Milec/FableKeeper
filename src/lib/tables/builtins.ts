import type { TableEntry } from "./roll";

/**
 * Built-in rollable tables shipped with FableKeeper. These are original,
 * system-flavoured tables (not copied rules text) usable in any campaign
 * without setup. Custom user tables live in the database; these are static.
 */
export interface BuiltinTable {
  id: string;
  name: string;
  category: string;
  description: string;
  entries: TableEntry[];
}

const w = (text: string, weight = 1): TableEntry => ({ text, weight });

export const BUILTIN_TABLES: BuiltinTable[] = [
  {
    id: "wilderness-events",
    name: "Wilderness Travel Events",
    category: "Travel",
    description: "Roll when the party spends a day crossing the wilds.",
    entries: [
      w("Nothing of note — just aching feet and open sky.", 4),
      w("Sudden weather turns the road to misery."),
      w("Tracks cross the path — something large passed recently."),
      w("A ruined shrine, half-swallowed by roots."),
      w("Distant smoke — a camp, or a warning?"),
      w("A traveler in need, or a bandit's lure."),
      w("Wild game worth hunting for rations."),
      w("A natural hazard blocks the easy route."),
      w("Strange lights after dusk."),
      w("A predator shadows the party."),
    ],
  },
  {
    id: "rumors",
    name: "Tavern Rumors",
    category: "Social",
    description: "Overheard gossip — some true, some not.",
    entries: [
      w("The old mine reopened, and the diggers won't talk about what they found."),
      w("A noble pays well for a certain book, no questions asked."),
      w("The bridge toll doubled overnight; the collector is new and nervous."),
      w("Someone's been leaving coins on graves at the north cemetery."),
      w("The baker's daughter vanished — third one this season."),
      w("A hermit in the hills trades cures for secrets."),
      w("The garrison hasn't been paid; morale is a powder keg."),
      w("A ship came in with no crew and a hold full of salt."),
    ],
  },
  {
    id: "trinkets",
    name: "Pocket Trinkets",
    category: "Loot",
    description: "Odd little things found in pockets, drawers, and dungeon dust.",
    entries: [
      w("A brass key that fits no known lock."),
      w("A dried flower pressed in a soldier's letter."),
      w("A die that always rolls the same number."),
      w("A tiny carved bird that whistles in the wind."),
      w("A cracked monocle that makes ink look wet."),
      w("A coin from a kingdom no one remembers."),
      w("A vial of sand that never quite runs out."),
      w("A ring sized for a finger far too large."),
      w("A map to a room, not a place."),
      w("A tooth on a leather cord, still warm."),
    ],
  },
  {
    id: "complications",
    name: "Combat Complications",
    category: "Combat",
    description: "Drop one in when a fight needs a twist.",
    entries: [
      w("The floor gives way beneath the heaviest combatant."),
      w("Reinforcements arrive in 1d4 rounds."),
      w("A lantern falls — a fire spreads each round."),
      w("A bystander stumbles into the crossfire."),
      w("The real objective starts to slip away."),
      w("Cover collapses, exposing the back line."),
      w("An ally's weapon breaks at the worst moment."),
      w("The enemy leader offers a deal, loudly."),
    ],
  },
  {
    id: "weather",
    name: "Changing Weather",
    category: "Travel",
    description: "A quick weather shift for the next few hours.",
    entries: [
      w("Clear and bright.", 3),
      w("Overcast, still air.", 2),
      w("Steady rain."),
      w("Rolling fog cuts sight to a stone's throw."),
      w("Gusting wind, grit in the eyes."),
      w("A sudden storm — thunder close behind."),
      w("Unseasonable cold, breath fogging."),
      w("Oppressive heat, shade a mercy."),
    ],
  },
];

export function getBuiltinTable(id: string): BuiltinTable | undefined {
  return BUILTIN_TABLES.find((t) => t.id === id);
}
