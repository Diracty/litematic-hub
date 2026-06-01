import { jsonValue } from "../nbt/convert.js";
import { keysToCamelCase, prepareBlockEntityValues } from "./defaults.js";

const BE_SKIP = new Set(["id", "x", "y", "z", "keepPacked", "DataVersion"]);

function ensureNamespacedId(id: string): string {
  if (!id) return "minecraft:air";
  return id.includes(":") ? id : `minecraft:${id}`;
}

export function blockEntityValues(
  beNbt: Record<string, unknown>
): { id: string; values: Record<string, unknown> } {
  const beId =
    typeof beNbt["id"] === "string" ? ensureNamespacedId(beNbt["id"]) : "unknown";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(beNbt)) {
    if (!BE_SKIP.has(k)) out[k] = jsonValue(v);
  }
  const prepared = prepareBlockEntityValues(out);
  const values = keysToCamelCase(prepared) as Record<string, unknown>;
  return { id: beId, values };
}
