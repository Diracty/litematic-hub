import { Router } from "express";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, litematicFilesTable, litematicPartsTable } from "@workspace/db";
import { parseLitematic, DEFAULT_SETTINGS, type ParseSettings } from "../lib/litematic-parser";
import { logger } from "../lib/logger";
import {
  MAX_LITEMATIC_UPLOAD_BYTES,
  MAX_LITEMATIC_UPLOAD_MB,
  PARTS_DB_BATCH_SIZE,
} from "../lib/upload-limits.js";
import { uploadParseErrorMessage } from "../lib/upload-errors.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LITEMATIC_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    if (file.originalname.endsWith(".litematic") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Only .litematic files allowed"));
    }
  },
});

function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: `File too large (max ${MAX_LITEMATIC_UPLOAD_MB} MB)`,
      });
      return;
    }
    next(err);
  });
}

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

router.get("/upload-limits", (_req, res) => {
  res.json({ maxUploadMb: MAX_LITEMATIC_UPLOAD_MB });
});

router.get("/files", async (req, res) => {
  try {
    const sessionId = req.query["sessionId"] as string | undefined;
    if (!sessionId) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(litematicFilesTable)
      .where(eq(litematicFilesTable.sessionId, sessionId))
      .orderBy(litematicFilesTable.createdAt);

    const result = rows.map((r) => ({
      key: r.key,
      name: r.name,
      partCount: r.partCount,
      sessionId: r.sessionId,
      createdAt: r.createdAt,
      sizeBytes: r.sizeBytes,
      blockCount: r.blockCount,
      entityCount: r.entityCount,
      blockEntityCount: r.blockEntityCount,
      regionCount: r.regionCount,
      blockTypes: r.blockTypes ?? {},
      entityTypes: r.entityTypes ?? {},
      blockEntityTypes: r.blockEntityTypes ?? {},
      dimensions: { x: r.dimensionsX ?? 0, y: r.dimensionsY ?? 0, z: r.dimensionsZ ?? 0 },
      settings: r.settings,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "listFiles error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/files/upload", uploadSingle, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const sessionId = (req.body["sessionId"] as string) || randomUUID();
  const started = Date.now();

  const settings: Partial<ParseSettings> = {};
  if (req.body["maxCoordsPerPart"]) settings.maxCoordsPerPart = parseInt(req.body["maxCoordsPerPart"]);
  if (req.body["maxCharsPerPart"]) settings.maxCharsPerPart = parseInt(req.body["maxCharsPerPart"]);
  if (req.body["chunkMode"]) settings.chunkMode = req.body["chunkMode"];
  if (req.body["entityMode"]) settings.entityMode = req.body["entityMode"];
  if (req.body["blockEntityMode"] !== undefined) settings.blockEntityMode = req.body["blockEntityMode"] !== "false";
  if (req.body["biomeMode"] !== undefined) settings.biomeMode = req.body["biomeMode"] === "true";

  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };

  try {
    req.log.info(
      { sizeBytes: req.file.size, name: req.file.originalname },
      "parse started",
    );
    const parsed = await parseLitematic(req.file.buffer, mergedSettings);
    const key = randomUUID();

    await db.insert(litematicFilesTable).values({
      key,
      sessionId,
      name: parsed.name,
      originalFilename: req.file.originalname,
      sizeBytes: req.file.size,
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
      settings: mergedSettings,
    });

    if (parsed.parts.length > 0) {
      await insertPartsBatched(key, parsed.parts);
    }

    req.log.info(
      {
        key,
        partCount: parsed.parts.length,
        sizeBytes: req.file.size,
        ms: Date.now() - started,
      },
      "File uploaded and parsed",
    );

    res.status(201).json({
      key,
      name: parsed.name,
      partCount: parsed.parts.length,
      sessionId,
      blockCount: parsed.blockCount,
      entityCount: parsed.entityCount,
      blockEntityCount: parsed.blockEntityCount,
      regionCount: parsed.regionCount,
    });
  } catch (err) {
    req.log.error(
      { err, sizeBytes: req.file.size, ms: Date.now() - started },
      "uploadFile parse error",
    );
    res.status(500).json({ error: uploadParseErrorMessage(err) });
  }
});

router.get("/files/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const [row] = await db
      .select()
      .from(litematicFilesTable)
      .where(eq(litematicFilesTable.key, key))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.json({
      key: row.key,
      name: row.name,
      partCount: row.partCount,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      sizeBytes: row.sizeBytes,
      blockCount: row.blockCount,
      entityCount: row.entityCount,
      blockEntityCount: row.blockEntityCount,
      regionCount: row.regionCount,
      blockTypes: row.blockTypes ?? {},
      entityTypes: row.entityTypes ?? {},
      blockEntityTypes: row.blockEntityTypes ?? {},
      dimensions: { x: row.dimensionsX ?? 0, y: row.dimensionsY ?? 0, z: row.dimensionsZ ?? 0 },
      settings: row.settings,
    });
  } catch (err) {
    req.log.error({ err }, "getFile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/files/:key", async (req, res) => {
  try {
    const { key } = req.params;
    await db.delete(litematicFilesTable).where(eq(litematicFilesTable.key, key));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteFile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/files/:key/download", async (req, res) => {
  try {
    const { key } = req.params;
    const [row] = await db
      .select()
      .from(litematicFilesTable)
      .where(eq(litematicFilesTable.key, key))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const parts = await db
      .select()
      .from(litematicPartsTable)
      .where(eq(litematicPartsTable.fileKey, key))
      .orderBy(litematicPartsTable.partNumber);

    const allData = parts.map((p) => p.data).join("\n");
    const buf = Buffer.from(allData, "utf-8");

    const filename = (row.originalFilename ?? row.name)
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.parsed.txt"`);
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "downloadFile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
