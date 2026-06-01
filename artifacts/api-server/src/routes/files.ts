import { Router } from "express";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { mkdirSync } from "node:fs";
import { readFile, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, litematicFilesTable, litematicPartsTable } from "@workspace/db";
import { parseLitematic, DEFAULT_SETTINGS, type ParseSettings } from "../lib/litematic-parser";
import {
  HOSTING_MAX_UPLOAD_BYTES,
  HOSTING_MAX_UPLOAD_MB,
  HOSTING_OOM_HINT,
  MAX_LITEMATIC_UPLOAD_BYTES,
  MAX_LITEMATIC_UPLOAD_MB,
  UPLOAD_TMP_DIR,
} from "../lib/upload-limits.js";
import { uploadParseErrorMessage } from "../lib/upload-errors.js";
import { persistParsedUpload } from "../lib/persist-parsed.js";
import {
  enqueueUploadJob,
  getUploadJob,
  shouldUseAsyncUpload,
} from "../lib/upload-queue.js";

const router = Router();

mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

/** Disk storage: avoid holding 30–100 MB twice in RAM (multer buffer + temp write). */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_TMP_DIR);
    },
    filename: (_req, _file, cb) => {
      cb(null, `upload-${randomUUID()}.litematic`);
    },
  }),
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

function parseBodySettings(body: Record<string, unknown>): ParseSettings {
  const settings: Partial<ParseSettings> = {};
  if (body["maxCoordsPerPart"]) settings.maxCoordsPerPart = parseInt(String(body["maxCoordsPerPart"]));
  if (body["maxCharsPerPart"]) settings.maxCharsPerPart = parseInt(String(body["maxCharsPerPart"]));
  if (body["chunkMode"]) settings.chunkMode = String(body["chunkMode"]) as ParseSettings["chunkMode"];
  if (body["entityMode"]) settings.entityMode = String(body["entityMode"]) as ParseSettings["entityMode"];
  if (body["blockEntityMode"] !== undefined) {
    settings.blockEntityMode = String(body["blockEntityMode"]) !== "false";
  }
  if (body["biomeMode"] !== undefined) {
    settings.biomeMode = String(body["biomeMode"]) === "true";
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

router.get("/upload-limits", (_req, res) => {
  res.json({
    maxUploadMb: MAX_LITEMATIC_UPLOAD_MB,
    hostingMaxUploadMb: HOSTING_MAX_UPLOAD_MB,
  });
});

router.get("/upload-jobs/:jobId", async (req, res) => {
  const job = await getUploadJob(req.params.jobId);
  if (!job) {
    res.status(404).json({
      error:
        "Задача не найдена (сервер перезапустился или устарела ссылка). Загрузите файл снова.",
    });
    return;
  }
  res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    result: job.result,
  });
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
  const mergedSettings = parseBodySettings(req.body as Record<string, unknown>);

  if (req.file.size > HOSTING_MAX_UPLOAD_BYTES) {
    await unlink(req.file.path).catch(() => undefined);
    res.status(413).json({
      error: `${HOSTING_OOM_HINT} (лимит на сервере: ${HOSTING_MAX_UPLOAD_MB} МБ, файл: ${(req.file.size / (1024 * 1024)).toFixed(1)} МБ)`,
    });
    return;
  }

  if (shouldUseAsyncUpload(req.file.size)) {
    const jobId = randomUUID();
    const destPath = join(UPLOAD_TMP_DIR, `${jobId}.litematic`);
    await rename(req.file.path, destPath);

    await enqueueUploadJob({
      jobId,
      sessionId,
      originalFilename: req.file.originalname,
      settings: mergedSettings,
      sizeBytes: req.file.size,
    });
    req.log.info({ jobId, sizeBytes: req.file.size }, "upload queued for background parse");
    res.status(202).json({
      jobId,
      status: "queued",
      sessionId,
      message: "Large file queued. Poll GET /api/upload-jobs/:jobId until status is done.",
    });
    return;
  }

  const started = Date.now();
  const tempPath = req.file.path;

  try {
    const buffer = await readFile(tempPath);
    const parsed = await parseLitematic(buffer, mergedSettings);
    const result = await persistParsedUpload(parsed, {
      sessionId,
      originalFilename: req.file.originalname,
      sizeBytes: req.file.size,
      settings: mergedSettings,
    });

    req.log.info(
      { key: result.key, partCount: result.partCount, sizeBytes: req.file.size, ms: Date.now() - started },
      "File uploaded and parsed",
    );

    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err, sizeBytes: req.file.size, ms: Date.now() - started }, "uploadFile parse error");
    res.status(500).json({ error: uploadParseErrorMessage(err) });
  } finally {
    await unlink(tempPath).catch(() => undefined);
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
      dimensions: { x: row.dimensionsX ?? 0, y: r.dimensionsY ?? 0, z: r.dimensionsZ ?? 0 },
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
