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
    return Number((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
  }
  if (t === "string") return tag.value;
  if (t === "byteArray") return Array.from(tag.value as number[]);
  if (t === "intArray") return Array.from(tag.value as number[]);
  if (t === "longArray") {
    return (tag.value as [number, number][]).map(([h, l]) =>
      Number((BigInt(h >>> 0) << 32n) | BigInt(l >>> 0))
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

// ── Block state decoding ──────────────────────────────────────────────────────

function decodePaletteIndex(longs: [number, number][], blockIndex: number, bitsPerBlock: number): number {
  if (bitsPerBlock === 0) return 0;
  const startBit = blockIndex * bitsPerBlock;
  const startLongIdx = Math.floor(startBit / 64);
  const endLongIdx = Math.floor((startBit + bitsPerBlock - 1) / 64);
  const bitOffset = BigInt(startBit % 64);
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;

  const [h1, l1] = longs[startLongIdx] ?? [0, 0];
  const val1 = (BigInt(h1 >>> 0) << 32n) | BigInt(l1 >>> 0);

  if (startLongIdx === endLongIdx) {
    return Number((val1 >> bitOffset) & mask);
  } else {
    // Решение проблемы "каши": склеиваем биты из двух разных Long
    const [h2, l2] = longs[endLongIdx] ?? [0, 0];
    const val2 = (BigInt(h2 >>> 0) << 32n) | BigInt(l2 >>> 0);
    const combined = (val1 >> bitOffset) | (val2 << (64n - bitOffset));
    return Number(combined & mask);
  }
}

function blockStateId(name: string, properties: Record<string, NbtTag>): string {
  const propEntries = Object.entries(properties);
  if (propEntries.length === 0) return name;
  const propsStr = propEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      // ФИКС: Конвертация byte (0/1) в логические true/false для 1.21.11
      const val = v.type === 'byte' ? (v.value === 1 ? 'true' : 'false') : v.value;
      return `${k}=${val}`;
    })
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
  private currentChars = 2; // 2 = "[]"

  constructor(private readonly maxCoords: number, private readonly maxChars: number) {}

  private flush(): void {
    if (this.current.length === 0) return;
    this.parts.push("[" + this.current.join(",") + "]");
    this.current = [];
    this.currentCoords = 0;
    this.currentChars = 2;
  }

  private tryAdd(entry: string, coords: number): boolean {
    const sep = this.current.length > 0 ? 1 : 0; // comma
    if (
      this.current.length > 0 &&
      (this.currentCoords + coords > this.maxCoords ||
        this.currentChars + sep + entry.length > this.maxChars)
    ) {
      return false;
    }
    this.current.push(entry);
    this.currentCoords += coords;
    this.currentChars += (this.current.length > 1 ? 1 : 0) + entry.length;
    return true;
  }

  /** Add a block type, splitting its coords across parts as needed. */
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

  /** Flush blocks, then add entity/BE. */
  addLast(entry: string, coords: number): void {
    if (!this.tryAdd(entry, coords)) {
      this.flush();
      if (this.current.length === 0) {
        this.current.push(entry);
        this.currentCoords += coords;
        this.currentChars += entry.length;
      } else {
        this.tryAdd(entry, coords);
      }
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

  const chunkGroupSz = chunkGroupSize(opts.chunkMode);
  const blocksByChunk = new Map<string, Map<string, Coord3[]>>();
  const blocksNoChunk = new Map<string, Coord3[]>();
  const entityItems: Array<{ pos: Coord3; nbt: Record<string, unknown> }> = [];
  const beItems: Array<{ pos: Coord3; values: Record<string, unknown> }> = [];

  let totalBlocks = 0;
  let totalEntities = 0;
  let totalBlockEntities = 0;

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
        const props = propsTag?.type === "compound" ? (propsTag.value as Record<string, NbtTag>) : {};
        palette.push({ id: blockStateId(name, props) });
      }
    }

    const blockStates = getLongArray(region, "BlockStates");
    // ФИКС: Расчет бит для Litematica (минимум 2, компактная упаковка)
    const bitsPerBlock = palette.length <= 1 ? 0 : Math.max(2, Math.ceil(Math.log2(palette.length)));

    for (let i = 0; i < volume; i++) {
      const paletteIdx = decodePaletteIndex(blockStates, i, bitsPerBlock);
      const block = palette[paletteIdx];
      if (!block) continue;
      if (AIR_BLOCKS.has(block.id.split("[")[0])) continue;

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
        const ck = chunkKey(ax, az, chunkGroupSz);
        if (!blocksByChunk.has(ck)) blocksByChunk.set(ck, new Map());
        const cm = blocksByChunk.get(ck)!;
        if (!cm.has(block.id)) cm.set(block.id, []);
        cm.get(block.id)!.push(coord);
      } else {
        if (!blocksNoChunk.has(block.id)) blocksNoChunk.set(block.id, []);
        blocksNoChunk.get(block.id)!.push(coord);
      }
    }

    if (opts.blockEntityMode) {
      const beList = getList(region, "TileEntities");
      if (beList.type === "compound") {
        for (const beCompound of beList.value as Record<string, NbtTag>[]) {
          const beNbt = nbtCompoundToJs(beCompound);
          beItems.push({ pos: [getInt(beCompound, "x"), getInt(beCompound, "y"), getInt(beCompound, "z")], values: blockEntityValues(beNbt) });
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
          let p: Coord3 = [0, 0, 0];
          if (posList.type === "double" && (posList.value as number[]).length >= 3) {
            p = (posList.value as number[]).map(Math.round) as Coord3;
          }
          entityItems.push({ pos: p, nbt: entNbt });
          totalEntities++;
        }
      }
    }
  }

  const blockTypes: Record<string, number> = {};
  const entityTypes: Record<string, number> = {};
  const blockEntityTypes: Record<string, number> = {};

  if (opts.chunkMode !== "off") {
    for (const cm of blocksByChunk.values()) {
      for (const [id, coords] of cm) blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
    }
  } else {
    for (const [id, coords] of blocksNoChunk) blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
  }

  for (const e of entityItems) entityTypes[String(e.nbt["id"] || "unknown")] = (entityTypes[String(e.nbt["id"] || "unknown")] ?? 0) + 1;
  for (const be of beItems) blockEntityTypes[String(be.values["id"] || "unknown")] = (blockEntityTypes[String(be.values["id"] || "unknown")] ?? 0) + 1;

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const regionName of regionNames) {
    const reg = regionsCompound[regionName].value as Record<string, NbtTag>;
    const p = getCompound(reg, "Position"), s = getCompound(reg, "Size");
    const px = getInt(p, "x"), py = getInt(p, "y"), pz = getInt(p, "z");
    const sx = getInt(s, "x"), sy = getInt(s, "y"), sz = getInt(s, "z");
    const x1 = px, x2 = px + sx + (sx < 0 ? 1 : -1);
    const y1 = py, y2 = py + sy + (sy > 0 ? -1 : 1);
    const z1 = pz, z2 = pz + sz + (sz > 0 ? -1 : 1);
    minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
    minZ = Math.min(minZ, z1, z2); maxZ = Math.max(maxZ, z1, z2);
  }

  const builder = new PartBuilder(opts.maxCoordsPerPart, opts.maxCharsPerPart);
  if (opts.chunkMode !== "off") {
    for (const ck of Array.from(blocksByChunk.keys()).sort()) {
      const cm = blocksByChunk.get(ck)!;
      for (const [id, coords] of cm) builder.addBlockType(id, coords);
    }
  } else {
    for (const [id, coords] of blocksNoChunk) builder.addBlockType(id, coords);
  }

  beItems.forEach(be => builder.addLast(JSON.stringify({ type: "blockEntity", pos: be.pos, values: be.values }), 1));
  entityItems.forEach(e => {
    const entry = opts.entityMode === "eggs" ? { type: "entity", egg: entityToEgg(e.nbt), pos: e.pos } : { type: "entity", nbt: e.nbt, pos: e.pos };
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
    dimensions: { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 }
  };
}