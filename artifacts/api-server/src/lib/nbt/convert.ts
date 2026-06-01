import type { NbtCompound, NbtTag } from "./types.js";

/** SNBT / old NBT: anonymous text segment stored under empty compound key. */
function absorbAnonymousTextKey(
  out: Record<string, unknown>,
  value: unknown
): void {
  if (typeof value !== "string") return;
  out.text = typeof out.text === "string" ? out.text + value : value;
}

function longPairToNumber(high: number, low: number): number {
  return Number((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
}

/** JSON text component (structure check — not a tag name list). */
function isTextComponentShape(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  return (
    "text" in o ||
    "extra" in o ||
    "translate" in o ||
    "selector" in o ||
    "score" in o ||
    "with" in o ||
    Object.prototype.hasOwnProperty.call(o, "")
  );
}

/**
 * Minecraft stores some compounds as JSON inside string NBT tags (1.20+ text).
 * Only expand when parsed JSON is a text component shape.
 */
function stringTagToJson(s: string): unknown {
  const t = s.trim();
  if (!t.startsWith("{")) return s;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (isTextComponentShape(parsed)) return jsonValue(parsed);
  } catch {
    /* plain string */
  }
  return s;
}

/**
 * Plain JSON values after NBT decode (numbers safe for JSON.stringify).
 */
export function jsonValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "boolean" || typeof val === "string") return val;
  if (Array.isArray(val)) return val.map((item) => jsonValue(item));

  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const n = jsonValue(v);
      if (k === "") {
        absorbAnonymousTextKey(out, n);
        continue;
      }
      if (k === "text" && typeof out.text === "string" && typeof n === "string") {
        out.text = out.text + n;
        continue;
      }
      out[k] = n;
    }
    return out;
  }

  return val;
}

/** Single NBT tag → JSON-safe value. */
export function nbtTagToJson(tag: NbtTag | null | undefined): unknown {
  if (!tag) return null;

  switch (tag.type) {
    case "byte":
    case "short":
    case "int":
    case "float":
    case "double":
      return tag.value;
    case "long": {
      const [h, l] = tag.value as [number, number];
      return longPairToNumber(h, l);
    }
    case "string":
      return stringTagToJson(String(tag.value ?? ""));
    case "byteArray":
      return Array.from(tag.value as number[]);
    case "intArray":
      return Array.from(tag.value as number[]);
    case "longArray":
      return (tag.value as [number, number][]).map(([h, l]) => longPairToNumber(h, l));
    case "list": {
      const inner = tag.value as { type: string; value: unknown[] };
      if (!inner?.value?.length) return [];
      if (inner.type === "compound") {
        return (inner.value as NbtCompound[]).map((c) => compoundToJson(c));
      }
      return inner.value.map((v) =>
        nbtTagToJson({ type: inner.type, value: v } as NbtTag)
      );
    }
    case "compound":
      return compoundToJson(tag.value as NbtCompound);
    default:
      return tag.value;
  }
}

/** NBT compound → JSON object (all entity/block NBT goes through here). */
export function compoundToJson(compound: NbtCompound): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, tag] of Object.entries(compound)) {
    const value = nbtTagToJson(tag);
    if (key === "") {
      absorbAnonymousTextKey(out, value);
      continue;
    }
    out[key] = value;
  }
  return jsonValue(out) as Record<string, unknown>;
}
