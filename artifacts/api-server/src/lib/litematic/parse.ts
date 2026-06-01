import nbt from "prismarine-nbt";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { NbtCompound, NbtTag } from "../nbt/types.js";
import {
  getCompound,
  getInt,
  getList,
  getLongArray,
  getStr,
} from "../nbt/read.js";
import { compoundToJson } from "../nbt/convert.js";
import {
  AIR_BLOCKS,
  baseBlockName,
  bitsPerBlockForPalette,
  decodePaletteIndex,
  paletteFromRegion,
} from "./blocks.js";
import { blockEntityValues } from "./blockEntities.js";
import { chunkGroupSize, chunkKey, compareChunkKeys } from "./chunks.js";
import { entityToEgg, mergeEntitiesInRegion } from "./entities.js";
import {
  localBlockIndexToWorld,
  readRegionContext,
  regionLocalToWorld,
} from "./regions.js";
import { addBatchedJsonEntries, PartBuilder } from "./parts.js";
import {
  DEFAULT_SETTINGS,
  type Coord3,
  type EntityPlacement,
  type ParseSettings,
  type ParsedLitematic,
  type ParseProgressReporter,
} from "./types.js";

const gunzipAsync = promisify(gunzip);

export { DEFAULT_SETTINGS, type ParseSettings, type ParsedLitematic, type ParseProgressReporter };

function reportProgress(
  onProgress: ParseProgressReporter | undefined,
  percent: number,
  stage: string
): void {
  onProgress?.(Math.min(100, Math.max(0, Math.round(percent))), stage);
}

export async function parseLitematicFromPath(
  filePath: string,
  settings: Partial<ParseSettings> = {},
  onProgress?: ParseProgressReporter,
): Promise<ParsedLitematic> {
  const { readFile } = await import("node:fs/promises");
  const compressed = await readFile(filePath);
  return parseLitematic(compressed, settings, onProgress);
}

export async function parseLitematic(
  buffer: Buffer,
  settings: Partial<ParseSettings> = {},
  onProgress?: ParseProgressReporter
): Promise<ParsedLitematic> {
  const opts: ParseSettings = { ...DEFAULT_SETTINGS, ...settings };

  reportProgress(onProgress, 2, "decompress");
  let compressed: Buffer | null = buffer;
  const decompressed = await gunzipAsync(compressed);
  compressed = null;

  reportProgress(onProgress, 8, "nbt");
  // Large schematics: BlockStates arrays can be 60MB+; default prismarine limit is ~16MB.
  const root = await nbt.parseUncompressed(decompressed, "big", {
    noArraySizeCheck: true,
  });
  reportProgress(onProgress, 15, "regions");

  const rootCompound = root.value as NbtCompound;
  const meta = getCompound(rootCompound, "Metadata");
  const schematicName = getStr(meta, "Name") || "Unnamed";

  const regionsTag = rootCompound["Regions"];
  if (!regionsTag || regionsTag.type !== "compound") {
    return emptyResult(schematicName);
  }

  const regionsCompound = regionsTag.value as Record<string, NbtTag>;
  const regionNames = Object.keys(regionsCompound);
  const chunkGroupSz = chunkGroupSize(opts.chunkMode);
  const useChunks = opts.chunkMode !== "off";

  const blocksByChunk = new Map<string, Map<string, Coord3[]>>();
  const blocksNoChunk = new Map<string, Coord3[]>();

  const beByChunk = new Map<
    string,
    Array<{ pos: Coord3; id: string; values: Record<string, unknown> }>
  >();
  const beFlat: Array<{
    pos: Coord3;
    id: string;
    values: Record<string, unknown>;
  }> = [];

  const entityItems: Array<{
    pos: EntityPlacement;
    nbt: Record<string, unknown>;
  }> = [];

  let totalBlocks = 0;
  let totalEntities = 0;
  let totalBlockEntities = 0;

  const regionCount = regionNames.length;

  for (let regionIndex = 0; regionIndex < regionCount; regionIndex++) {
    const regionName = regionNames[regionIndex]!;
    const regionTag = regionsCompound[regionName];
    if (regionTag.type !== "compound") continue;
    const region = regionTag.value as NbtCompound;
    const ctx = readRegionContext(region);

    const absSizeX = Math.abs(ctx.sizeX);
    const absSizeY = Math.abs(ctx.sizeY);
    const absSizeZ = Math.abs(ctx.sizeZ);
    const volume = absSizeX * absSizeY * absSizeZ;

    const palette = paletteFromRegion(getList(region, "BlockStatePalette"));
    const blockStates = getLongArray(region, "BlockStates");
    const bitsPerBlock = bitsPerBlockForPalette(palette.length);

    for (let i = 0; i < volume; i++) {
      const paletteIdx = decodePaletteIndex(blockStates, i, bitsPerBlock);
      let block = palette[paletteIdx];

      if (!block && paletteIdx === 0) {
        block = { id: "minecraft:air" };
      }
      if (!block) continue;
      if (AIR_BLOCKS.has(baseBlockName(block.id))) continue;

      const ly = Math.floor(i / (absSizeX * absSizeZ));
      const rem = i % (absSizeX * absSizeZ);
      const lz = Math.floor(rem / absSizeX);
      const lx = rem % absSizeX;

      const coord = localBlockIndexToWorld(lx, ly, lz, ctx);
      totalBlocks++;

      if (useChunks) {
        const ck = chunkKey(coord[0], coord[2], chunkGroupSz);
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
        for (const beCompound of beList.value as NbtCompound[]) {
          const beNbt = compoundToJson(beCompound);
          const localX = getInt(beCompound, "x");
          const localY = getInt(beCompound, "y");
          const localZ = getInt(beCompound, "z");
          const pos: Coord3 = [
            regionLocalToWorld(localX, ctx.posX, ctx.sizeX),
            regionLocalToWorld(localY, ctx.posY, ctx.sizeY),
            regionLocalToWorld(localZ, ctx.posZ, ctx.sizeZ),
          ];
          const { id: beId, values } = blockEntityValues(beNbt);
          if (Object.keys(values).length === 0) continue;

          const item = { pos, id: beId, values };
          if (useChunks) {
            const ck = chunkKey(pos[0], pos[2], chunkGroupSz);
            if (!beByChunk.has(ck)) beByChunk.set(ck, []);
            beByChunk.get(ck)!.push(item);
          } else {
            beFlat.push(item);
          }
          totalBlockEntities++;
        }
      }
    }

    if (opts.entityMode !== "off") {
      const entList = getList(region, "Entities");
      if (entList.type === "compound") {
        const merged = mergeEntitiesInRegion(
          entList.value as NbtCompound[],
          ctx
        );
        for (const item of merged) {
          entityItems.push(item);
          totalEntities++;
        }
      }
    }

    reportProgress(
      onProgress,
      15 + Math.floor((75 * (regionIndex + 1)) / Math.max(1, regionCount)),
      "regions"
    );
  }

  reportProgress(onProgress, 92, "parts");

  const blockTypes: Record<string, number> = {};
  const entityTypes: Record<string, number> = {};
  const blockEntityTypes: Record<string, number> = {};

  if (useChunks) {
    for (const cm of blocksByChunk.values()) {
      for (const [id, coords] of cm) {
        blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
      }
    }
  } else {
    for (const [id, coords] of blocksNoChunk) {
      blockTypes[id] = (blockTypes[id] ?? 0) + coords.length;
    }
  }

  for (const e of entityItems) {
    const id = (e.nbt["id"] as string) ?? "unknown";
    entityTypes[id] = (entityTypes[id] ?? 0) + 1;
  }

  const allBe = useChunks ? Array.from(beByChunk.values()).flat() : beFlat;
  for (const be of allBe) {
    blockEntityTypes[be.id] = (blockEntityTypes[be.id] ?? 0) + 1;
  }

  const dimensions = computeDimensions(regionNames, regionsCompound);

  const builder = new PartBuilder(opts.maxCoordsPerPart, opts.maxCharsPerPart);
  const maxChars = opts.maxCharsPerPart;

  type BeItem = { pos: Coord3; id: string; values: Record<string, unknown> };

  const addBlockEntityBatches = (items: BeItem[], chunk?: string): void => {
    addBatchedJsonEntries(
      builder,
      maxChars,
      items,
      (batch) =>
        JSON.stringify({
          type: "blockEntity",
          ...(chunk !== undefined ? { chunk } : {}),
          blocks: (batch as BeItem[]).map((be) => ({
            pos: be.pos,
            values: be.values,
          })),
        }),
      (batch) => batch.length
    );
  };

  const formatEntityOutput = (e: {
    pos: EntityPlacement;
    nbt: Record<string, unknown>;
  }) => {
    if (opts.entityMode === "eggs") {
      return { egg: entityToEgg(e.nbt), pos: e.pos };
    }
    return { nbt: e.nbt, pos: e.pos };
  };

  if (useChunks) {
    const chunkKeys = new Set([...blocksByChunk.keys(), ...beByChunk.keys()]);
    const sortedChunks = Array.from(chunkKeys).sort(compareChunkKeys);
    const chunkTotal = Math.max(1, sortedChunks.length);

    for (let ci = 0; ci < sortedChunks.length; ci++) {
      const ck = sortedChunks[ci]!;
      const cm = blocksByChunk.get(ck);
      if (cm) {
        const blockIds = Array.from(cm.keys()).sort();
        for (const blockId of blockIds) {
          builder.addBlockType(blockId, cm.get(blockId)!);
        }
      }

      const beChunk = beByChunk.get(ck);
      if (beChunk && beChunk.length > 0) {
        addBlockEntityBatches(beChunk, ck);
      }

      builder.finishChunk();
      reportProgress(onProgress, 92 + Math.floor((5 * (ci + 1)) / chunkTotal), "parts");
    }
  } else {
    for (const [blockId, coords] of blocksNoChunk) {
      builder.addBlockType(blockId, coords);
    }
    addBlockEntityBatches(beFlat);
    reportProgress(onProgress, 96, "parts");
  }

  builder.finishChunk();

  const entityTotal = Math.max(1, entityItems.length);
  for (let ei = 0; ei < entityItems.length; ei++) {
    const entityOut = formatEntityOutput(entityItems[ei]!);
    addBatchedJsonEntries(
      builder,
      maxChars,
      [entityOut],
      (batch) => JSON.stringify({ type: "entity", entities: batch }),
      (batch) => batch.length
    );
    reportProgress(onProgress, 97 + Math.floor((2 * (ei + 1)) / entityTotal), "entities");
  }

  reportProgress(onProgress, 100, "done");

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
    dimensions,
  };
}

function emptyResult(name: string): ParsedLitematic {
  return {
    name,
    parts: [],
    blockCount: 0,
    entityCount: 0,
    blockEntityCount: 0,
    regionCount: 0,
    blockTypes: {},
    entityTypes: {},
    blockEntityTypes: {},
    dimensions: { x: 0, y: 0, z: 0 },
  };
}

function computeDimensions(
  regionNames: string[],
  regionsCompound: Record<string, NbtTag>
): { x: number; y: number; z: number } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const regionName of regionNames) {
    const regionTag = regionsCompound[regionName];
    if (regionTag.type !== "compound") continue;
    const ctx = readRegionContext(regionTag.value as NbtCompound);

    const rMinX = Math.min(
      ctx.posX,
      ctx.posX + ctx.sizeX + (ctx.sizeX < 0 ? 1 : -1)
    );
    const rMaxX = Math.max(
      ctx.posX,
      ctx.posX + ctx.sizeX + (ctx.sizeX < 0 ? 1 : -1)
    );
    const rMinY = Math.min(
      ctx.posY,
      ctx.posY + ctx.sizeY + (ctx.sizeY < 0 ? 1 : -1)
    );
    const rMaxY = Math.max(
      ctx.posY,
      ctx.posY + ctx.sizeY + (ctx.sizeY < 0 ? 1 : -1)
    );
    const rMinZ = Math.min(
      ctx.posZ,
      ctx.posZ + ctx.sizeZ + (ctx.sizeZ < 0 ? 1 : -1)
    );
    const rMaxZ = Math.max(
      ctx.posZ,
      ctx.posZ + ctx.sizeZ + (ctx.sizeZ < 0 ? 1 : -1)
    );

    if (rMinX < minX) minX = rMinX;
    if (rMinY < minY) minY = rMinY;
    if (rMinZ < minZ) minZ = rMinZ;
    if (rMaxX > maxX) maxX = rMaxX;
    if (rMaxY > maxY) maxY = rMaxY;
    if (rMaxZ > maxZ) maxZ = rMaxZ;
  }

  return {
    x: Number.isFinite(maxX) ? maxX - minX + 1 : 0,
    y: Number.isFinite(maxY) ? maxY - minY + 1 : 0,
    z: Number.isFinite(maxZ) ? maxZ - minZ + 1 : 0,
  };
}
