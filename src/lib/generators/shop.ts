import { createRng, type Rng } from "./random";
import { generateNames } from "./names";
import {
  ANCESTRIES,
  SHOP_QUIRKS,
  SHOP_TYPES,
  TAVERN_ADJ,
  type ShopType,
} from "./data";

export const SETTLEMENT_SIZES = [
  { id: "thorp", label: "Thorp", stock: [3, 5], magicChance: 0 },
  { id: "village", label: "Village", stock: [4, 7], magicChance: 0.1 },
  { id: "town", label: "Town", stock: [6, 10], magicChance: 0.25 },
  { id: "city", label: "City", stock: [9, 14], magicChance: 0.5 },
  { id: "metropolis", label: "Metropolis", stock: [12, 18], magicChance: 0.8 },
] as const;

export type SettlementSizeId = (typeof SETTLEMENT_SIZES)[number]["id"];

export interface ShopOptions {
  shopType?: string | "any";
  settlementSize?: SettlementSizeId;
  /** 1–20; nudges prices and available rarity upward. */
  settlementLevel?: number;
  seed?: number | string;
}

export interface ShopItem {
  name: string;
  price: string;
  quantity: number;
}

export interface GeneratedShop {
  name: string;
  type: string;
  keeper: { name: string; quirk: string };
  description: string;
  items: ShopItem[];
}

/** Format a whole-copper amount as a PF2E-style gp/sp/cp price string. */
function formatPrice(cp: number): string {
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  const parts: string[] = [];
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (c) parts.push(`${c} cp`);
  return parts.join(" ") || "free";
}

function priceForGood(rng: Rng, index: number, level: number): number {
  // Deterministic-ish base derived from the good's position, then jittered and
  // scaled by settlement level. Not official PF2E pricing — a plausible stand-in.
  const base = 20 + index * 15; // in copper
  const jitter = rng.int(-8, 40);
  const scale = 1 + level * 0.12;
  return Math.max(5, Math.round(((base + jitter) * scale) / 5) * 5);
}

function resolveType(rng: Rng, id: string | "any" | undefined): ShopType {
  if (!id || id === "any") return rng.pick(SHOP_TYPES);
  return SHOP_TYPES.find((s) => s.id === id) ?? rng.pick(SHOP_TYPES);
}

export function generateShop(options: ShopOptions = {}): GeneratedShop {
  const rng = createRng(options.seed);
  const type = resolveType(rng, options.shopType);
  const size =
    SETTLEMENT_SIZES.find((s) => s.id === options.settlementSize) ??
    SETTLEMENT_SIZES[1];
  const level = Math.min(Math.max(options.settlementLevel ?? 3, 1), 20);

  // Shop name: "The <Adj> <KeeperTitle-ish>" or "<Keeper>'s <Type>".
  const keeperName = generateNames({
    kind: "person",
    ancestry: rng.pick(ANCESTRIES),
    count: 1,
    seed: rng.int(0, 2 ** 30),
  })[0]!;
  const shopName = rng.chance(0.5)
    ? `The ${rng.pick(TAVERN_ADJ)} ${type.label}`
    : `${keeperName.split(" ")[0]}'s ${type.label}`;

  const [min, max] = size.stock;
  const wanted = rng.int(min, max);
  const goods = rng.sample(type.goods, Math.min(wanted, type.goods.length));
  const items: ShopItem[] = goods.map((name, i) => ({
    name,
    price: formatPrice(priceForGood(rng, i, level)),
    quantity: rng.int(1, name.includes("potion") || name.includes("scroll") ? 5 : 12),
  }));

  const keeper = { name: keeperName, quirk: rng.pick(SHOP_QUIRKS) };
  const description =
    `${shopName} is ${type.id === "tavern" ? "a" : "a modest"} ${type.label.toLowerCase()} ` +
    `serving a ${size.label.toLowerCase()}. The ${type.keeperTitle}, ${keeper.name}, ${keeper.quirk}.`;

  return { name: shopName, type: type.label, keeper, description, items };
}

export function shopToMarkdown(shop: GeneratedShop): string {
  return [
    `# ${shop.name}`,
    "",
    `*${shop.type}*`,
    "",
    shop.description,
    "",
    "## Inventory",
    "",
    "| Item | Price | Qty |",
    "| --- | --- | --- |",
    ...shop.items.map((i) => `| ${i.name} | ${i.price} | ${i.quantity} |`),
  ].join("\n");
}
