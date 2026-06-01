import type { NbtCompound, NbtTag } from "./types.js";

export function getStr(compound: NbtCompound, key: string): string {
  const tag = compound[key];
  if (!tag) return "";
  return String(tag.value ?? "");
}

export function getInt(compound: NbtCompound, key: string): number {
  const tag = compound[key];
  if (!tag) return 0;
  if (tag.type === "long") {
    const [high, low] = tag.value as [number, number];
    return Number((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
  }
  return Number(tag.value ?? 0);
}

export function getList(
  compound: NbtCompound,
  key: string
): { type: string; value: unknown[] } {
  const tag = compound[key];
  if (!tag || tag.type !== "list") return { type: "end", value: [] };
  return tag.value as { type: string; value: unknown[] };
}

export function readTagNumberList(compound: NbtCompound, key: string): number[] {
  const list = getList(compound, key);
  if (!list.value?.length) return [];
  return list.value.map((v) => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "value" in v) {
      return Number((v as { value: unknown }).value);
    }
    return Number(v);
  });
}

export function getLongArray(compound: NbtCompound, key: string): [number, number][] {
  const tag = compound[key];
  if (!tag || tag.type !== "longArray") return [];
  return tag.value as [number, number][];
}

export function getCompound(compound: NbtCompound, key: string): NbtCompound {
  const tag = compound[key];
  if (!tag || tag.type !== "compound") return {};
  return tag.value as NbtCompound;
}
