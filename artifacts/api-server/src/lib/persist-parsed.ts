import { randomUUID } from "crypto";
import { db, litematicFilesTable, litematicPartsTable } from "@workspace/db";
import type { ParseSettings, ParsedLitematic } from "./litematic/types.js";
import { PARTS_DB_BATCH_SIZE } from "./upload-limits.js";

async function insertPartsBatched(fileKey: string, parts: string[]): Promise<void> {
  for (let i = 0; i < parts.length; i += PARTS_DB_BATCH_SIZE) {
    const slice = parts.slice(i, i + PARTS_DB_BATCH_SIZE);
    await db.insert(litematicPartsTable).values(
      slice.map((data, j) => ({
        fileKey,
        partNumber: i + j + 1,
        data,
      })),
    );
  }
}

export type PersistedUpload = {
  key: string;
  name: string;
  partCount: number;
  sessionId: string;
  blockCount: number;
  entityCount: number;
  blockEntityCount: number;
  regionCount: number;
};

export async function persistParsedUpload(
  parsed: ParsedLitematic,
  opts: {
    sessionId: string;
    originalFilename: string;
    sizeBytes: number;
    settings: ParseSettings;
  },
): Promise<PersistedUpload> {
  const key = randomUUID();

  await db.insert(litematicFilesTable).values({
    key,
    sessionId: opts.sessionId,
    name: parsed.name,
    originalFilename: opts.originalFilename,
    sizeBytes: opts.sizeBytes,
    partCount: parsed.parts.length,
    blockCount: parsed.blockCount,
    entityCount: parsed.entityCount,
    blockEntityCount: parsed.blockEntityCount,
    regionCount: parsed.regionCount,
    blockTypes: parsed.blockTypes,
    entityTypes: parsed.entityTypes,
    blockEntityTypes: parsed.blockEntityTypes,
    dimensionsX: parsed.dimensions.x,
    dimensionsY: parsed.dimensions.y,
    dimensionsZ: parsed.dimensions.z,
    settings: opts.settings,
  });

  if (parsed.parts.length > 0) {
    await insertPartsBatched(key, parsed.parts);
  }

  return {
    key,
    name: parsed.name,
    partCount: parsed.parts.length,
    sessionId: opts.sessionId,
    blockCount: parsed.blockCount,
    entityCount: parsed.entityCount,
    blockEntityCount: parsed.blockEntityCount,
    regionCount: parsed.regionCount,
  };
}
