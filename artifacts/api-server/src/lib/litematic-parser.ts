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
  blockTypes: Record<string, number>;
  entityTypes: Record<string, number>;
  blockEntityTypes: Record<string, number>;
  dimensions: { x: number; y: number; z: number };
}

type NbtTag = { type: string; value: unknown };
type Coord3 = [number, number, number];

// ── NBT helpers ──────────────────────────────────────────────────────────────

function nbtVal(tag: NbtTag): unknown {
  if (!tag) return null;
  const t = tag.type;
  if (t === "byte" || t === "short" || t === "int" || t === "float" || t === "double") {
    return tag.value;
  }
  if (t === "long") {
    const [high, low] = tag.value as [number, number];
    return (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
  }
  if (t === "string") return tag.value;
  if (t === "byteArray") return Array.from(tag.value as number[]);
  if (t === "intArray") return Array.from(tag.value as number[]);
  if (t === "longArray") {
    return (tag.value as [number, number][]).map(([h, l]) =>
      (BigInt(h >>> 0) << 32n) | BigInt(l >>> 0)
    );
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
    const val = nbtVal(v);
    out[k] = typeof val === "bigint" ? val.toString() : val;
  }
  return out;
}

function getStr(compound: Record<string, NbtTag>, key: string): string {
  const tag = compound[key];
  return tag && typeof tag.value === "string" ? tag.value : "";
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

// ── Block state decoding (FIXED FOR LITEMATIC BIT-PACKING) ────────────────────

function decodePaletteIndex(longs: [number, number][], blockIndex: number, bitsPerBlock: number): number {
  if (bitsPerBlock === 0) return 0;

  const startBit = blockIndex * bitsPerBlock;
  const startLongIdx = Math.floor(startBit / 64);
  const endLongIdx = Math.floor((startBit + bitsPerBlock - 1) / 64);
  const shift = BigInt(startBit % 64);
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;

  const [h1, l1] = longs[startLongIdx] ?? [0, 0];
  const val1 = (BigInt(h1 >>> 0) << 32n) | BigInt(l1 >>> 0);

  if (startLongIdx === endLongIdx) {
    return Number((val1 >> shift) & mask);
  } else {
    const [h2, l2] = longs[endLongIdx] ?? [0, 0];
    const val2 = (BigInt(h2 >>> 0) << 32n) | BigInt(l2 >>> 0);
    const combined = (val1 >> shift) | (val2 << (64n - shift));
    return Number(combined & mask);
  }
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

const AIR_BLOCKS = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);

// ── Chunk grouping ────────────────────────────────────────────────────────────

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

// ── Entity helpers ────────────────────────────────────────────────────────────

function entityTypeToSpawnEgg(entityId: string): string {
  const type = entityId.replace(/^minecraft:/, "");
  return `minecraft:${type}_spawn_egg`;
}

function entityToEgg(entityNbt: Record<string, unknown>): unknown {
  const id = (entityNbt["id"] as string) ?? "minecraft:pig";
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entityNbt)) {
    if (k !== "Pos" && k !== "Motion" && k !== "Rotation") {
      data[k] = v;
    }
  }
  data["id"] = id;
  return { id: entityTypeToSpawnEgg(id), count: 1, components: { "minecraft:entity_data": data } };
}

const BE_SKIP = new Set(["id", "x", "y", "z", "keepPacked", "DataVersion"]);

function blockEntityValues(beNbt: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(beNbt)) {
    if (!BE_SKIP.has(k)) out[k] = v;
  }
  return out;
}

// ── Part builder ─────────────────────────────────────────────────────────────

class PartBuilder {
  private parts: string[] = [];
  private current: string[] = [];
  private currentCoords = 0;
  private currentChars = 2;

  constructor(private readonly maxCoords: number, private readonly maxChars: number) {}

  private flush(): void {
    if (this.current.length === 0) return;
    this.parts.push("[" + this.current.join(",") + "]");
    this.current = [];
    this.currentCoords = 0;
    this.currentChars = 2;
  }

  private tryAdd(entry: string, coords: number): boolean {
    const sep = this.current.length > 0 ? 1 : 0;
    if (
      this.current.length > 0 &&
      (this.currentCoords + coords > this.maxCoords ||
        this.currentChars + sep + entry.length > this.maxChars)
    ) {
      return false;
    }
    this.current.push(entry);
    this.currentCoords += coords;
    this.currentChars += sep + entry.length;
    return true;
  }

  addBlockType(id: string, allCoords: Coord3[]): void {
    let offset = 0;
    while (offset < allCoords.length) {
      const remainCoords = this.maxCoords - this.currentCoords;
      if (remainCoords <= 0) {
        this.flush();
        continue;
      }
      const take = Math.min(remainCoords, allCoords.length - offset);
      const slice = allCoords.slice(offset, offset + take);
      const entry = JSON.stringify({ type: "block", id, coords: slice });

      if (!this.tryAdd(entry, take)) {
        if (this.current.length === 0) {
          this.current.push(entry);
          this.currentCoords += take;
          this.currentChars += entry.length;
          offset += take;
          this.flush();
        } else {
          this.flush();
        }
      } else {
        offset += take;
      }
    }
  }

  addLast(entry: string, coords: number): void {
    if (!this.tryAdd(entry, coords)) {
      this.flush();
      this.tryAdd(entry, coords);
    }
  }

  getParts(): string[] {
    this.flush();
    return this.parts;
  }
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseLitematic(
  buffer: Buffer,
  settings: Partial<ParseSettings> = {}
): Promise<ParsedLitematic> {
  const opts: ParseSettings = { ...DEFAULT_SETTINGS, ...settings };

  const decompressed = await gunzipAsync(buffer);
  const { parsed: root } = await (
    nbt as unknown as { parse: (buf: Buffer) => Promise<{ parsed: NbtTag }> }
  ).parse(decompressed);
  const rootCompound = root.value as Record<string, NbtTag>;

  const meta = getCompound(rootCompound, "Metadata");
  const schematicName = getStr(meta, "Name") || "Unnamed";

  const regionsTag = rootCompound["Regions"];
  if (!regionsTag || regionsTag.type !== "compound") {
    return { name: schematicName, parts: [], blockCount: 0, entityCount: 0, blockEntityCount: 0, regionCount: 0, blockTypes: {}, entityTypes: {}, blockEntityTypes: {}, dimensions: { x: 0, y: 0, z: 0 } };
  }
  const regionsCompound = regionsTag.value as Record<string, NbtTag>;
  const regionNames = Object.keys(regionsCompound);

  const builder = new PartBuilder(opts.maxCoordsPerPart, opts.maxCharsPerPart);
  const blocksByChunk = new Map<string, Map<string, Coord3[]>>();
  const blocksNoChunk = new Map<string, Coord3[]>();
  const entityItems: Array<{ pos: Coord3; nbt: Record<string, unknown> }> = [];
  const beItems: Array<{ pos: Coord3; values: Record<string, unknown> }> = [];

  let totalBlocks = 0;
  let totalEntities = 0;
  let totalBlockEntities = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const regionName of regionNames) {
    const regionTag = regionsCompound[regionName];
    if (regionTag.type !== "compound") continue;
    const region = regionTag.value as Record<string, NbtTag>;

    const posTag = getCompound(region, "Position");
    const sizeTag = getCompound(region, "Size");

    const rPosX = getInt(posTag, "x");
    const rPosY = getInt(posTag, "y");
    const rPosZ = getInt(posTag, "z");
    const rSizeX = getInt(sizeTag, "x");
    const rSizeY = getInt(sizeTag, "y");
    const rSizeZ = getInt(sizeTag, "z");

    const absSizeX = Math.abs(rSizeX);
    const absSizeY = Math.abs(rSizeY);
    const absSizeZ = Math.abs(rSizeZ);

    // Update global dimensions
    const x1 = rPosX, x2 = rPosX + rSizeX + (rSizeX > 0 ? -1 : 1);
    const y1 = rPosY, y2 = rPosY + rSizeY + (rSizeY > 0 ? -1 : 1);
    const z1 = rPosZ, z2 = rPosZ + rSizeZ + (rSizeZ > 0 ? -1 : 1);
    minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
    minZ = Math.min(minZ, z1, z2); maxZ = Math.max(maxZ, z1, z2);

    const paletteList = getList(region, "BlockStatePalette");
    const palette: string[] = [];
    if (paletteList.type === "compound") {
      for (const entry of paletteList.value as Record<string, NbtTag>[]) {
        const name = getStr(entry, "Name");
        const propsTag = entry["Properties"];
        const props = propsTag?.type === "compound" ? (propsTag.value as Record<string, NbtTag>) : {};
        palette.push(blockStateId(name, props));
      }
    }

    const blockStates = getLongArray(region, "BlockStates");
    // FIXED: bitsPerBlock for Litematic is just ceil(log2(paletteSize))
    const bitsPerBlock = palette.length <= 1 ? 0 : Math.ceil(Math.log2(palette.length));
    const volume = absSizeX * absSizeY * absSizeZ;

    for (let i = 0; i < volume; i++) {
      const paletteIdx = decodePaletteIndex(blockStates, i, bitsPerBlock);
      const blockId = palette[paletteIdx];
      if (!blockId) continue;
      if (AIR_BLOCKS.has(blockId.split("[")[0])) continue;

      const ly = Math.floor(i / (absSizeX * absSizeZ));
      const rem = i % (absSizeX * absSizeZ);
      const lz = Math.floor(rem / absSizeX);
      const lx = rem % absSizeX;

      const ax = rPosX + (rSizeX < 0 ? lx + rSizeX + 1 : lx);
      const ay = rPosY + (rSizeY < 0 ? ly + rSizeY + 1 : ly);
      const az = rPosZ + (rSizeZ < 0 ? lz + rSizeZ + 1 : lz);

      totalBlocks++;
      const coord: Coord3 = [ax, ay, az];
      if (opts.chunkMode !== "off") {
        const ck = chunkKey(ax, az, chunkGroupSize(opts.chunkMode));
        if (!blocksByChunk.has(ck)) blocksByChunk.set(ck, new Map());
        const cm = blocksByChunk.get(ck)!;
        if (!cm.has(blockId)) cm.set(blockId, []);
        cm.get(blockId)!.push(coord);
      } else {
        if (!blocksNoChunk.has(blockId)) blocksNoChunk.set(blockId, []);
        blocksNoChunk.get(blockId)!.push(coord);
      }
    }

    if (opts.blockEntityMode) {
      const beList = getList(region, "TileEntities");
      if (beList.type === "compound") {
        for (const beCompound of beList.value as Record<string, NbtTag>[]) {
          const beNbt = nbtCompoundToJs(beCompound);
          const pos = [getInt(beCompound, "x"), getInt(beCompound, "y"), getInt(beCompound, "z")] as Coord3;
          const values = blockEntityValues(beNbt);
          beItems.push({ pos, values });
          totalBlockEntities++;
        }
      }
    }

    if (opts.entityMode !== "off") {
      const entList = getList(region, "Entities");
      if (entList.type === "compound") {
        for (const entCompound of entList.value as Record<string, NbtTag>[]) {
          const entNbt = nbtCompoundToJs(entCompound);
          const posList = getList(entCompound, "Pos");
          let pos: Coord3 = [0, 0, 0];
          if (posList.type === "double") {
            pos = (posList.value as number[]).map(Math.round) as Coord3;
          }
          entityItems.push({ pos, nbt: entNbt });
          totalEntities++;
        }
      }
    }
  }

  // Finalize counts
  const blockTypes: Record<string, number> = {};
  if (opts.chunkMode !== "off") {
    for (const cm of blocksByChunk.values()) {
      for (const [id, coords] of cm) blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
    }
  } else {
    for (const [id, coords] of blocksNoChunk) blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
  }

  const entityTypes: Record<string, number> = {};
  for (const e of entityItems) {
    const id = String(e.nbt["id"] || "unknown");
    entityTypes[id] = (entityTypes[id] ?? 0) + 1;
  }

  const blockEntityTypes: Record<string, number> = {};
  for (const be of beItems) {
    const id = String(be.values["id"] || "unknown");
    blockEntityTypes[id] = (blockEntityTypes[id] ?? 0) + 1;
  }

  // Build Parts
  if (opts.chunkMode !== "off") {
    for (const ck of Array.from(blocksByChunk.keys()).sort()) {
      for (const [id, coords] of blocksByChunk.get(ck)!) builder.addBlockType(id, coords);
    }
  } else {
    for (const [id, coords] of blocksNoChunk) builder.addBlockType(id, coords);
  }

  beItems.forEach(be => {
    builder.addLast(JSON.stringify({ type: "blockEntity", pos: be.pos, values: be.values }), 1);
  });

  entityItems.forEach(e => {
    const entry = opts.entityMode === "eggs" 
      ? { type: "entity", egg: entityToEgg(e.nbt), pos: e.pos }
      : { type: "entity", nbt: e.nbt, pos: e.pos };
    builder.addLast(JSON.stringify(entry), 1);
  });

  return {
    name: schematicName,
    parts: builder.getParts(),
    blockCount: totalBlocks,
    entityCount: totalEntities,
    blockEntityCount: totalBlockEntities,
    regionCount: regionNames.length,
    blockTypes,
    entityTypes,
    blockEntityTypes,
    dimensions: {
      x: isFinite(maxX) ? maxX - minX + 1 : 0,
      y: isFinite(maxY) ? maxY - minY + 1 : 0,
      z: isFinite(maxZ) ? maxZ - minZ + 1 : 0,
    }
  };
}