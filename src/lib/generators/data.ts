/**
 * Curated data tables for the generators. These are original, PF2E-flavoured
 * lists (ancestries, traits, occupations, shop goods, name fragments) — not
 * copied rules text — so generation works fully offline and deterministically.
 * Kept in one module so PF2E data can grow independently of generator logic.
 */

export const ANCESTRIES = [
  "Human",
  "Elf",
  "Dwarf",
  "Gnome",
  "Goblin",
  "Halfling",
  "Orc",
  "Leshy",
  "Kobold",
  "Catfolk",
  "Tengu",
  "Ratfolk",
  "Lizardfolk",
  "Hobgoblin",
] as const;
export type Ancestry = (typeof ANCESTRIES)[number];

/** Given names + family names per ancestry (original, evocative fragments). */
export const NAMES: Record<Ancestry, { given: string[]; family: string[] }> = {
  Human: {
    given: ["Aldric", "Mirena", "Corvin", "Selene", "Tobin", "Yelena", "Darion", "Isolde", "Marek", "Rosalind", "Cael", "Nadia"],
    family: ["Vance", "Ashford", "Dunmore", "Kessler", "Thorne", "Bellweather", "Marsh", "Holloway"],
  },
  Elf: {
    given: ["Aelrindel", "Sylvara", "Caelum", "Nithariel", "Faelar", "Lithael", "Vaeril", "Miriel", "Thessaly", "Aerdrie"],
    family: ["Moonwhisper", "Silverleaf", "Duskbloom", "Starfall", "Nightbreeze", "Dawnstrider"],
  },
  Dwarf: {
    given: ["Brakka", "Durgan", "Helga", "Torvald", "Barendd", "Vistra", "Kildrak", "Morgna", "Grimna", "Baern"],
    family: ["Stoneforge", "Ironvein", "Deepdelver", "Anvilheart", "Coalbeard", "Grimhammer"],
  },
  Gnome: {
    given: ["Fibblewick", "Zaltie", "Nissa", "Pock", "Wren", "Bimble", "Quilla", "Fenn", "Tazzle", "Orin"],
    family: ["Fizzlebang", "Copperkettle", "Glimmergem", "Tinkertop", "Nimblefinger"],
  },
  Goblin: {
    given: ["Snik", "Gurza", "Mogmog", "Chidi", "Rutter", "Vex", "Pux", "Nibs", "Grelt", "Zizzy"],
    family: ["the Chewer", "Skitterfang", "Ashteeth", "Bonerattle", "Mudlicker"],
  },
  Halfling: {
    given: ["Pippa", "Milo", "Rosie", "Corun", "Tansy", "Bandobras", "Nedda", "Ferrin", "Lila", "Osborn"],
    family: ["Greenbottle", "Thornapple", "Underbough", "Highhill", "Goodbarrel"],
  },
  Orc: {
    given: ["Grosk", "Ranna", "Hokk", "Ushka", "Zoltar", "Draega", "Murg", "Ketza", "Brugg", "Vola"],
    family: ["Bloodtusk", "Ironhide", "Skullcleave", "Redscar", "Stormfang"],
  },
  Leshy: {
    given: ["Bramble", "Pip", "Thornlet", "Mossback", "Sprout", "Vinewhistle", "Acorn", "Fernly", "Dewdrop"],
    family: ["of the Deep Grove", "Rootbound", "Petalfall", "Sunreacher"],
  },
  Kobold: {
    given: ["Kip", "Sazzt", "Rilka", "Gnash", "Vexil", "Tikka", "Zorb", "Meep", "Skarr", "Nyx"],
    family: ["Redscale", "Trapfinder", "Emberclaw", "Deepwarren", "Bright-Eye"],
  },
  Catfolk: {
    given: ["Rune", "Sable", "Mireh", "Tovi", "Ashra", "Kesh", "Lio", "Purrah", "Nima", "Dask"],
    family: ["Swiftpaw", "Nightprowl", "Emberwhisker", "Silktail"],
  },
  Tengu: {
    given: ["Karr", "Iku", "Shrike", "Vell", "Corvi", "Raku", "Peko", "Onyx", "Skree", "Tama"],
    family: ["Blackfeather", "Stormcaller", "Windperch", "Brightbeak"],
  },
  Ratfolk: {
    given: ["Squick", "Nimm", "Tibbs", "Vera", "Chizzik", "Pol", "Deft", "Manda", "Rook", "Scree"],
    family: ["Quickwhisker", "Cheesemonger", "Sewerborn", "Coinnose"],
  },
  Lizardfolk: {
    given: ["Sesh", "Krik", "Vashka", "Otoro", "Sythe", "Naga", "Utok", "Sslith", "Iss", "Rekk"],
    family: ["of the Warm Mire", "Sharptooth", "Stillwater", "Sunbask"],
  },
  Hobgoblin: {
    given: ["Vargo", "Kessa", "Drenn", "Morgo", "Ithra", "Barok", "Zell", "Nagra", "Torm", "Vess"],
    family: ["Ironrank", "Bloodbanner", "Steelmarch", "Grimwall"],
  },
};

export const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
] as const;

export const OCCUPATIONS = [
  "blacksmith", "innkeeper", "farmer", "guard", "merchant", "scholar", "priest",
  "hunter", "sailor", "thief", "healer", "scribe", "miner", "bard", "soldier",
  "fisher", "carpenter", "alchemist", "tanner", "mercenary", "noble", "beggar",
  "cook", "stablehand", "cartographer", "smuggler", "herbalist", "tax collector",
];

export const PERSONALITY_TRAITS = [
  "quick to laugh but slow to trust", "meticulous to the point of obsession",
  "warm to strangers, guarded with friends", "restless and easily bored",
  "unfailingly polite, even when threatening", "boastful about small things",
  "soft-spoken but stubborn as stone", "curious about everything forbidden",
  "generous with coin, stingy with truth", "haunted by an old regret",
  "loyal to a fault", "wickedly sarcastic", "calm in a crisis, anxious in peace",
  "superstitious and full of small rituals", "ambitious and impatient",
];

export const IDEALS = [
  "Freedom above all else.", "Order is the only shield against chaos.",
  "The strong must protect the weak.", "Knowledge is worth any price.",
  "Family is everything.", "The old ways must be preserved.",
  "Every debt must be repaid.", "Power is the only truth.",
  "Beauty makes suffering bearable.", "Redemption is always possible.",
];

export const BONDS = [
  "a sibling who vanished without a trace", "the village that raised them",
  "a mentor now long dead", "a sacred blade passed down for generations",
  "a debt owed to a dangerous person", "a child they secretly provide for",
  "a rival they can't stop measuring themselves against", "a ruined homeland",
  "a promise made at a deathbed", "a hidden shrine only they still tend",
];

export const FLAWS = [
  "cannot resist a wager", "trusts the wrong people", "drinks to forget",
  "quick to anger over insults to their honor", "greedy beyond reason",
  "terrified of deep water", "keeps dangerous secrets out of pride",
  "holds grudges for decades", "reckless when someone is watching",
  "lies even when the truth would serve better",
];

export const GOALS = [
  "to buy back their family's confiscated land", "to find who betrayed them",
  "to earn a title they were denied", "to see the ocean before they die",
  "to pay off a crushing debt", "to prove a long-dismissed theory",
  "to protect a secret at any cost", "to escape a past that keeps catching up",
  "to master a craft no one else remembers", "to avenge a fallen friend",
];

export const APPEARANCE_BUILD = ["wiry", "broad-shouldered", "gaunt", "stocky", "willowy", "heavyset", "compact", "lean"];
export const APPEARANCE_FEATURE = [
  "a jagged scar across one brow", "mismatched eyes", "an easy, crooked grin",
  "calloused, ink-stained hands", "a shaved head and many earrings",
  "a nervous, darting gaze", "an old burn along the neck", "unusually fine teeth",
  "close-cropped grey hair", "a tattoo of a coiled serpent", "a limp favoring the left leg",
];
export const VOICE = [
  "a low, gravelly rumble", "a bright, rapid patter", "a careful, measured cadence",
  "a hoarse whisper", "a booming, theatrical boom", "a sing-song lilt",
  "a flat, unreadable monotone", "a warm, honeyed drawl",
];

// ---- Places ----------------------------------------------------------------
export const TAVERN_ADJ = ["Rusty", "Gilded", "Drunken", "Salty", "Prancing", "Weeping", "Copper", "Laughing", "Silent", "Broken", "Wandering", "Crimson"];
export const TAVERN_NOUN = ["Tankard", "Griffon", "Anchor", "Lantern", "Boar", "Crown", "Mermaid", "Dagger", "Barrel", "Kraken", "Rose", "Wyrm"];
export const SHIP_ADJ = ["Swift", "Iron", "Silent", "Golden", "Restless", "Storm", "Dawn", "Black", "Emerald", "Wayward"];
export const SHIP_NOUN = ["Gull", "Fortune", "Serpent", "Maiden", "Dagger", "Tide", "Star", "Revenant", "Albatross", "Vengeance"];
export const SETTLE_PREFIX = ["Ashen", "Green", "Stone", "Black", "White", "Fair", "Thorn", "Ravens", "Mill", "Oaken", "Salt", "North"];
export const SETTLE_SUFFIX = ["ford", "vale", "burgh", "haven", "reach", "wick", "moor", "hollow", "crest", "gate", "mere", "fell"];

// ---- Shops ----------------------------------------------------------------
export interface ShopType {
  id: string;
  label: string;
  keeperTitle: string;
  goods: string[];
}

export const SHOP_TYPES: ShopType[] = [
  {
    id: "general", label: "General Store", keeperTitle: "shopkeeper",
    goods: ["rope (50 ft)", "torch", "rations (1 week)", "waterskin", "bedroll", "lantern", "flint and steel", "chalk", "grappling hook", "fishing tackle", "sack", "oil (flask)", "soap", "tent", "crowbar"],
  },
  {
    id: "weapons", label: "Weaponsmith", keeperTitle: "smith",
    goods: ["dagger", "shortsword", "longsword", "handaxe", "mace", "spear", "shortbow", "crossbow", "warhammer", "rapier", "battle axe", "sling", "glaive", "whip"],
  },
  {
    id: "armor", label: "Armorer", keeperTitle: "armorer",
    goods: ["leather armor", "studded leather", "chain shirt", "hide armor", "breastplate", "half plate", "wooden shield", "steel shield", "gauntlets", "helm"],
  },
  {
    id: "alchemist", label: "Alchemist", keeperTitle: "alchemist",
    goods: ["minor healing potion", "antidote", "alchemist's fire", "smokestick", "tanglefoot bag", "thunderstone", "sunrod", "acid flask", "elixir of life (lesser)", "bottled lightning"],
  },
  {
    id: "magic", label: "Curiosities & Curios", keeperTitle: "curio dealer",
    goods: ["scroll of a cantrip", "wand of a 1st-rank spell", "everburning torch", "bag of holding (Type I)", "cloak of elvenkind", "boots of the winterlands", "ring of the ram (minor)", "a cracked, humming crystal", "a map to nowhere", "a talking (rude) skull"],
  },
  {
    id: "apothecary", label: "Apothecary", keeperTitle: "herbalist",
    goods: ["healer's kit", "bandages", "willowbark tincture", "sleeping draught", "burn salve", "smelling salts", "poultice", "dried herbs (bundle)", "leeches (jar)", "tonic for the nerves"],
  },
  {
    id: "tavern", label: "Tavern Provisions", keeperTitle: "publican",
    goods: ["ale (mug)", "wine (bottle)", "hearty stew", "roast fowl", "bread and cheese", "a bed for the night", "strong spirits (shot)", "traveler's pie", "hot cider"],
  },
];

export const SHOP_QUIRKS = [
  "haggles cheerfully and always loses a little", "never makes eye contact",
  "swears every item has a story", "is suspicious of adventurers",
  "offers a discount for a good rumor", "is desperate to sell and clearly hiding why",
  "keeps a fat, judgmental cat on the counter", "quotes prices in a dead language first",
  "won't sell to anyone they consider 'unlucky'", "throws in a 'free gift' with strings attached",
];
