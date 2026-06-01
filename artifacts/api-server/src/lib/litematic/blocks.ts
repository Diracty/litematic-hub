import type { NbtCompound, NbtTag } from "../nbt/types.js";
import { getStr } from "../nbt/read.js";

export const AIR_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

export function baseBlockName(blockId: string): string {
  return blockId.split("[")[0];
}

function blockStateId(name: string, properties: Record<string, NbtTag>): string {
  const propEntries = Object.entries(properties);
  if (propEntries.length === 0) return name;
  const propsStr = propEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v.value}`)
    .join(",");
  return `${name}[${propsStr}]`;
}

export function paletteFromRegion(
  paletteList: { type: string; value: unknown[] }
): Array<{ id: string }> {
  const palette: Array<{ id: string }> = [];
  if (paletteList.type !== "compound") return palette;
  for (const entry of paletteList.value as NbtCompound[]) {
    const name = getStr(entry, "Name");
    const propsTag = entry["Properties"];
    const props =
      propsTag && propsTag.type === "compound"
        ? (propsTag.value as Record<string, NbtTag>)
        : {};
    palette.push({ id: blockStateId(name, props) });
  }
  return palette;
}

function readPackedLong(longs: [number, number][], idx: number): bigint {
  const [high, low] = longs[idx] ?? [0, 0];
  return (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
}

export function decodePaletteIndex(
  longs: [number, number][],
  blockIndex: number,
  bitsPerBlock: number
): number {
  const startOffset = blockIndex * bitsPerBlock;
  const startLongIdx = startOffset >> 6;
  const endLongIdx = ((blockIndex + 1) * bitsPerBlock - 1) >> 6;
  const startBitOffset = startOffset & 63;
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;

  if (startLongIdx === endLongIdx) {
    return Number(
      (readPackedLong(longs, startLongIdx) >> BigInt(startBitOffset)) & mask
    );
  }

  const endOffset = 64 - startBitOffset;
  const val =
    readPackedLong(longs, startLongIdx) >> BigInt(startBitOffset) |
    readPackedLong(longs, endLongIdx) << BigInt(endOffset);
  return Number(val & mask);
}

export function bitsPerBlockForPalette(paletteSize: number): number {
  if (paletteSize <= 1) return 2;
  return Math.max(2, Math.ceil(Math.log2(paletteSize)));
}
