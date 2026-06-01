import { jsonValue } from "../nbt/convert.js";

/**
 * Block entities: NBT → JSON + camelCase for the loader.
 * No “vanilla default” tables and no dropping 0 / false / "" / [].
 * Empty slots in item lists (air) are still removed — that is inventory cleanup only.
 */

const ITEM_LIST_KEYS = new Set([
  "HandItems",
  "ArmorItems",
  "Inventory",
  "Items",
  "Equipment",
]);

const ITEM_STACK_KEYS = new Set([
  "Item",
  "item",
  "SaddleItem",
  "body_armor_item",
  "saddle",
]);

function isEmptyItemStack(item: Record<string, unknown>): boolean {
  const id = String(item.id ?? item.Id ?? "minecraft:air");
  const count = Number(item.count ?? item.Count ?? 0);
  const hasExtra =
    (item.components &&
      typeof item.components === "object" &&
      Object.keys(item.components as object).length > 0) ||
    (item.tag &&
      typeof item.tag === "object" &&
      Object.keys(item.tag as object).length > 0);
  return (
    (id === "minecraft:air" || id === "minecraft:empty") && count === 0 && !hasExtra
  );
}

function looksLikeItemStack(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    ("count" in o || "Count" in o || "components" in o || "tag" in o) &&
    (typeof o.id === "string" || typeof o.Id === "string" || "components" in o)
  );
}

/** Only filter air/empty stacks inside chest-like lists — not entity NBT. */
function filterItemList(val: unknown): unknown {
  if (!Array.isArray(val)) return jsonValue(val);
  const kept = val
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const o = item as Record<string, unknown>;
      if (isEmptyItemStack(o)) return null;
      return jsonValue(o);
    })
    .filter((x) => x !== null);
  return kept;
}

export function prepareBlockEntityValues(
  data: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (ITEM_LIST_KEYS.has(k) && Array.isArray(v)) {
      out[k] = filterItemList(v);
      continue;
    }
    if (ITEM_STACK_KEYS.has(k) && looksLikeItemStack(v)) {
      const o = v as Record<string, unknown>;
      if (!isEmptyItemStack(o)) out[k] = jsonValue(v);
      continue;
    }
    out[k] = jsonValue(v);
  }
  return out;
}

export function toCamelCaseKey(key: string): string {
  if (key.includes("_") || !key.length) return key;
  if (key[0] === key[0].toLowerCase()) return key;
  return key[0].toLowerCase() + key.slice(1);
}

export function keysToCamelCase(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(keysToCamelCase);
  if (val && typeof val === "object" && !looksLikeItemStack(val)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[toCamelCaseKey(k)] = keysToCamelCase(v);
    }
    return out;
  }
  return val;
}
