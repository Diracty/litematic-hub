import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db, litematicFilesTable, litematicPartsTable } from "@workspace/db";
import { parseLitematic, DEFAULT_SETTINGS, type ParseSettings } from "../lib/litematic-parser";
import { logger } from "../lib/logger";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.originalname.endsWith(".litematic") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Only .litematic files allowed"));
    }
  },
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
      settings: r.settings,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "listFiles error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/files/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const sessionId = (req.body["sessionId"] as string) || randomUUID();

  const settings: Partial<ParseSettings> = {};
  if (req.body["maxCoordsPerPart"]) settings.maxCoordsPerPart = parseInt(req.body["maxCoordsPerPart"]);
  if (req.body["maxCharsPerPart"]) settings.maxCharsPerPart = parseInt(req.body["maxCharsPerPart"]);
  if (req.body["chunkMode"]) settings.chunkMode = req.body["chunkMode"];
  if (req.body["entityMode"]) settings.entityMode = req.body["entityMode"];
  if (req.body["blockEntityMode"] !== undefined) settings.blockEntityMode = req.body["blockEntityMode"] !== "false";
  if (req.body["biomeMode"] !== undefined) settings.biomeMode = req.body["biomeMode"] === "true";

  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };

  try {
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
      settings: mergedSettings,
    });

    if (parsed.parts.length > 0) {
      await db.insert(litematicPartsTable).values(
        parsed.parts.map((data, i) => ({
          fileKey: key,
          partNumber: i + 1,
          data,
        }))
      );
    }

    req.log.info({ key, partCount: parsed.parts.length }, "File uploaded and parsed");

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
    req.log.error({ err }, "uploadFile parse error");
    res.status(500).json({ error: "Failed to parse litematic file" });
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
