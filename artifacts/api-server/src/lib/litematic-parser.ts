import nbt from "prismarine-nbt";
import { promisify } from "util";
import { gunzip } from "zlib";

const gunzipAsync = promisify(gunzip);

export interface ParseSettings {
  maxCoordsPerPart: number;
  maxCharsPerPart: number;
  chunkMode: "off" | "1x1" | "2x2" | "3x3" | "4x4";
  entityMode: "off" | "nbt" | "eggs";
  blockEntityMode: boolean;
  biomeMode: boolean;
}

export const DEFAULT_SETTINGS: ParseSettings = {
  maxCoordsPerPart: 1024,
  maxCharsPerPart: 20000,
  chunkMode: "off",
  entityMode: "eggs",
  blockEntityMode: true,
  biomeMode: false,
};

export interface ParsedLitematic {
  name: string;
  parts: string[];
  blockCount: number;
  entityCount: number;
  blockEntityCount: number;
  regionCount: number;
}

type NbtTag = { type: string; value: unknown };

function nbtVal(tag: NbtTag): unknown {
  if (!tag) return null;
  const t = tag.type;
  if (t === "byte" || t === "short" || t === "int" || t === "float" || t === "double") {
    return tag.value;
  }
  if (t === "long") {
    const [high, low] = tag.value as [number, number];
    return Number((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
  }
  if (t === "string") return tag.value;
  if (t === "byteArray") {
    const buf = tag.value as Buffer | number[];
    return Array.from(buf as number[]);
  }
  if (t === "intArray") {
    const arr = tag.value as Int32Array | number[];
    return Array.from(arr as number[]);
  }
  if (t === "longArray") {
    const arr = tag.value as [number, number][];
    return arr.map(([h, l]) => Number((BigInt(h >>> 0) << 32n) | BigInt(l >>> 0)));
  }
  if (t === "list") {
    const inner = tag.value as { type: string; value: unknown[] };
    if (!inner.value || inner.value.length === 0) return [];
    if (inner.type === "compound") {
      return (inner.value as Record<string, NbtTag>[]).map(nbtCompoundToJs);
    }
    return inner.value.map((v) => nbtVal({ type: inner.type, value: v } as NbtTag));
  }
  if (t === "compound") {
    return nbtCompoundToJs(tag.value as Record<string, NbtTag>);
  }
  return tag.value;
}

function nbtCompoundToJs(compound: Record<string, NbtTag>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(compound)) {
    out[k] = nbtVal(v);
  }
  return out;
}

function getStr(compound: Record<string, NbtTag>, key: string): string {
  const tag = compound[key];
  if (!tag) return "";
  return String(tag.value ?? "");
}

function getInt(compound: Record<string, NbtTag>, key: string): number {
  const tag = compound[key];
  if (!tag) return 0;
  if (tag.type === "long") {
    const [high, low] = tag.value as [number, number];
    return Number((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
  }
  return Number(tag.value ?? 0);
}

function getCompound(compound: Record<string, NbtTag>, key: string): Record<string, NbtTag> {
  const tag = compound[key];
  if (!tag || tag.type !== "compound") return {};
  return tag.value as Record<string, NbtTag>;
}

function getList(compound: Record<string, NbtTag>, key: string): { type: string; value: unknown[] } {
  const tag = compound[key];
  if (!tag || tag.type !== "list") return { type: "end", value: [] };
  return tag.value as { type: string; value: unknown[] };
}

function getLongArray(compound: Record<string, NbtTag>, key: string): [number, number][] {
  const tag = compound[key];
  if (!tag || tag.type !== "longArray") return [];
  return tag.value as [number, number][];
}

function decodePaletteIndex(
  longs: [number, number][],
  blockIndex: number,
  bitsPerBlock: number
): number {
  const blocksPerLong = Math.floor(64 / bitsPerBlock);
  const longIdx = Math.floor(blockIndex / blocksPerLong);
  const bitOffset = (blockIndex % blocksPerLong) * bitsPerBlock;
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const [high, low] = longs[longIdx] ?? [0, 0];
  const bigVal = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
  return Number((bigVal >> BigInt(bitOffset)) & mask);
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

const AIR_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

function chunkGroupSize(mode: string): number {
  switch (mode) {
    case "1x1": return 1;
    case "2x2": return 2;
    case "3x3": return 3;
    case "4x4": return 4;
    default: return 0;
  }
}

function chunkKey(x: number, z: number, groupSize: number): string {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  if (groupSize <= 1) return `${cx},${cz}`;
  return `${Math.floor(cx / groupSize)},${Math.floor(cz / groupSize)}`;
}

function entityTypeToSpawnEgg(entityId: string): string {
  const type = entityId.replace("minecraft:", "");
  return `minecraft:${type}_spawn_egg`;
}

function entityToEgg(entityNbt: Record<string, unknown>): unknown {
  const id = entityNbt["id"] as string ?? "minecraft:pig";
  const cleanNbt: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entityNbt)) {
    if (k !== "Pos" && k !== "Motion" && k !== "Rotation" && k !== "id") {
      cleanNbt[k] = v;
    }
  }
  cleanNbt["id"] = id;
  return {
    id: entityTypeToSpawnEgg(id),
    count: 1,
    components: {
      "minecraft:entity_data": cleanNbt,
    },
  };
}

function blockEntityValues(beNbt: Record<string, unknown>): Record<string, unknown> {
  const SKIP_KEYS = new Set(["id", "x", "y", "z", "keepPacked", "DataVersion"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(beNbt)) {
    if (!SKIP_KEYS.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

class PartAccumulator {
  private parts: string[] = [];
  private currentItems: string[] = [];
  private currentCoords = 0;
  private currentChars = 0;
  private readonly maxCoords: number;
  private readonly maxChars: number;

  constructor(maxCoords: number, maxChars: number) {
    this.maxCoords = maxCoords;
    this.maxChars = maxChars;
  }

  addItem(jsonStr: string, coordCount: number): void {
    const wouldChars = this.currentChars + jsonStr.length + (this.currentItems.length > 0 ? 1 : 0);
    const wouldCoords = this.currentCoords + coordCount;
    if (
      this.currentItems.length > 0 &&
      (wouldCoords > this.maxCoords || wouldChars > this.maxChars)
    ) {
      this.flush();
    }
    this.currentItems.push(jsonStr);
    this.currentCoords += coordCount;
    this.currentChars += jsonStr.length + (this.currentItems.length > 1 ? 1 : 0);
  }

  flush(): void {
    if (this.currentItems.length === 0) return;
    this.parts.push(this.currentItems.join(","));
    this.currentItems = [];
    this.currentCoords = 0;
    this.currentChars = 0;
  }

  getParts(): string[] {
    this.flush();
    return this.parts;
  }
}

export async function parseLitematic(
  buffer: Buffer,
  settings: Partial<ParseSettings> = {}
): Promise<ParsedLitematic> {
  const opts: ParseSettings = { ...DEFAULT_SETTINGS, ...settings };

  const decompressed = await gunzipAsync(buffer);
  const { parsed: root } = await (nbt as unknown as { parse: (buf: Buffer, opts?: unknown) => Promise<{ parsed: NbtTag }> }).parse(decompressed);
  const rootCompound = root.value as Record<string, NbtTag>;

  const meta = getCompound(rootCompound, "Metadata");
  const schematicName = getStr(meta, "Name") || "Unnamed";

  const regionsTag = rootCompound["Regions"];
  if (!regionsTag || regionsTag.type !== "compound") {
    return { name: schematicName, parts: [], blockCount: 0, entityCount: 0, blockEntityCount: 0, regionCount: 0 };
  }
  const regionsCompound = regionsTag.value as Record<string, NbtTag>;
  const regionNames = Object.keys(regionsCompound);

  const accumulator = new PartAccumulator(opts.maxCoordsPerPart, opts.maxCharsPerPart);
  const chunkGroupSz = chunkGroupSize(opts.chunkMode);

  let totalBlocks = 0;
  let totalEntities = 0;
  let totalBlockEntities = 0;

  const blocksByChunk = new Map<string, Map<string, [number, number, number][]>>();
  const blocksNoChunk = new Map<string, [number, number, number][]>();
  const entities: Array<{ pos: [number, number, number]; nbt: Record<string, unknown> }> = [];
  const blockEntities: Array<{ pos: [number, number, number]; values: Record<string, unknown> }> = [];

  for (const regionName of regionNames) {
    const regionTag = regionsCompound[regionName];
    if (regionTag.type !== "compound") continue;
    const region = regionTag.value as Record<string, NbtTag>;

    const posTag = getCompound(region, "Position");
    const sizeTag = getCompound(region, "Size");
    const rPosX = getInt(posTag, "x") || getInt(posTag, "X");
    const rPosY = getInt(posTag, "y") || getInt(posTag, "Y");
    const rPosZ = getInt(posTag, "z") || getInt(posTag, "Z");
    const rSizeX = getInt(sizeTag, "x") || getInt(sizeTag, "X");
    const rSizeY = getInt(sizeTag, "y") || getInt(sizeTag, "Y");
    const rSizeZ = getInt(sizeTag, "z") || getInt(sizeTag, "Z");

    const absSizeX = Math.abs(rSizeX);
    const absSizeY = Math.abs(rSizeY);
    const absSizeZ = Math.abs(rSizeZ);
    const volume = absSizeX * absSizeY * absSizeZ;

    const paletteList = getList(region, "BlockStatePalette");
    const palette: Array<{ id: string }> = [];
    if (paletteList.type === "compound") {
      for (const entry of paletteList.value as Record<string, NbtTag>[]) {
        const name = getStr(entry, "Name");
        const propsTag = entry["Properties"];
        const props = propsTag && propsTag.type === "compound"
          ? (propsTag.value as Record<string, NbtTag>)
          : {};
        palette.push({ id: blockStateId(name, props) });
      }
    }

    const blockStates = getLongArray(region, "BlockStates");
    const bitsPerBlock = palette.length > 1 ? Math.max(2, Math.ceil(Math.log2(palette.length))) : 2;

    for (let i = 0; i < volume; i++) {
      const paletteIdx = decodePaletteIndex(blockStates, i, bitsPerBlock);
      const block = palette[paletteIdx];
      if (!block || AIR_BLOCKS.has(block.id.split("[")[0])) continue;

      const ly = Math.floor(i / (absSizeX * absSizeZ));
      const rem = i % (absSizeX * absSizeZ);
      const lz = Math.floor(rem / absSizeX);
      const lx = rem % absSizeX;

      const ax = rPosX + (rSizeX < 0 ? lx + rSizeX + 1 : lx);
      const ay = rPosY + (rSizeY < 0 ? ly + rSizeY + 1 : ly);
      const az = rPosZ + (rSizeZ < 0 ? lz + rSizeZ + 1 : lz);

      totalBlocks++;

      if (opts.chunkMode !== "off") {
        const ck = chunkKey(ax, az, chunkGroupSz);
        if (!blocksByChunk.has(ck)) blocksByChunk.set(ck, new Map());
        const chunkMap = blocksByChunk.get(ck)!;
        if (!chunkMap.has(block.id)) chunkMap.set(block.id, []);
        chunkMap.get(block.id)!.push([ax, ay, az]);
      } else {
        if (!blocksNoChunk.has(block.id)) blocksNoChunk.set(block.id, []);
        blocksNoChunk.get(block.id)!.push([ax, ay, az]);
      }
    }

    if (opts.entityMode !== "off") {
      const entList = getList(region, "Entities");
      if (entList.type === "compound") {
        for (const entCompound of entList.value as Record<string, NbtTag>[]) {
          const entNbt = nbtCompoundToJs(entCompound);
          const posList = getList(entCompound, "Pos");
          let ex = 0, ey = 0, ez = 0;
          if (posList.type === "double" && posList.value.length >= 3) {
            ex = Math.round(posList.value[0] as number);
            ey = Math.round(posList.value[1] as number);
            ez = Math.round(posList.value[2] as number);
          }
          entities.push({ pos: [ex, ey, ez], nbt: entNbt });
          totalEntities++;
        }
      }
    }

    if (opts.blockEntityMode) {
      const beList = getList(region, "TileEntities");
      if (beList.type === "compound") {
        for (const beCompound of beList.value as Record<string, NbtTag>[]) {
          const beNbt = nbtCompoundToJs(beCompound);
          const bex = getInt(beCompound, "x");
          const bey = getInt(beCompound, "y");
          const bez = getInt(beCompound, "z");
          const values = blockEntityValues(beNbt);
          if (Object.keys(values).length > 0) {
            blockEntities.push({ pos: [bex, bey, bez], values });
            totalBlockEntities++;
          }
        }
      }
    }
  }

  if (opts.chunkMode !== "off") {
    const sortedChunks = Array.from(blocksByChunk.keys()).sort();
    for (const ck of sortedChunks) {
      const chunkMap = blocksByChunk.get(ck)!;
      for (const [blockId, coords] of chunkMap) {
        const obj = JSON.stringify({ type: "block", id: blockId, coords });
        accumulator.addItem(obj, coords.length);
      }
    }
  } else {
    for (const [blockId, coords] of blocksNoChunk) {
      let offset = 0;
      while (offset < coords.length) {
        const slice = coords.slice(offset, offset + opts.maxCoordsPerPart);
        const obj = JSON.stringify({ type: "block", id: blockId, coords: slice });
        accumulator.addItem(obj, slice.length);
        offset += slice.length;
      }
    }
  }

  if (opts.entityMode !== "off" && entities.length > 0) {
    const BATCH = 64;
    for (let i = 0; i < entities.length; i += BATCH) {
      const batch = entities.slice(i, i + BATCH);
      const entityItems = batch.map((e) => {
        if (opts.entityMode === "eggs") {
          return { egg: entityToEgg(e.nbt), pos: e.pos };
        }
        return { nbt: e.nbt, pos: e.pos };
      });
      const obj = JSON.stringify({ type: "entity", entities: entityItems });
      accumulator.addItem(obj, batch.length);
    }
  }

  if (opts.blockEntityMode && blockEntities.length > 0) {
    const BATCH = 32;
    for (let i = 0; i < blockEntities.length; i += BATCH) {
      const batch = blockEntities.slice(i, i + BATCH);
      const blocks = batch.map((be) => ({ pos: be.pos, values: be.values }));
      const obj = JSON.stringify({ type: "blockEntity", blocks });
      accumulator.addItem(obj, batch.length);
    }
  }

  const parts = accumulator.getParts();

  return {
    name: schematicName,
    parts,
    blockCount: totalBlocks,
    entityCount: totalEntities,
    blockEntityCount: totalBlockEntities,
    regionCount: regionNames.length,
  };
}
