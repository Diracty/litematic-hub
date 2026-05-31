import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, litematicFilesTable, litematicPartsTable } from "@workspace/db";

const router = Router();

router.get("/info/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const [row] = await db
      .select({ key: litematicFilesTable.key, name: litematicFilesTable.name, partCount: litematicFilesTable.partCount })
      .from(litematicFilesTable)
      .where(eq(litematicFilesTable.key, key))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.json({ key: row.key, name: row.name, partCount: row.partCount });
  } catch (err) {
    req.log.error({ err }, "getFileInfo error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/part/:key/:number", async (req, res) => {
  try {
    const { key } = req.params;
    const num = parseInt(req.params["number"] ?? "1", 10);

    if (isNaN(num) || num < 1) {
      res.status(400).json({ error: "Invalid part number" });
      return;
    }

    const [fileRow] = await db
      .select({ partCount: litematicFilesTable.partCount })
      .from(litematicFilesTable)
      .where(eq(litematicFilesTable.key, key))
      .limit(1);

    if (!fileRow) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (num > fileRow.partCount) {
      res.status(404).json({ error: `Part ${num} does not exist (total: ${fileRow.partCount})` });
      return;
    }

    const [partRow] = await db
      .select()
      .from(litematicPartsTable)
      .where(
        and(
          eq(litematicPartsTable.fileKey, key),
          eq(litematicPartsTable.partNumber, num)
        )
      )
      .limit(1);

    if (!partRow) {
      res.status(404).json({ error: "Part not found" });
      return;
    }

    res.json({
      key,
      number: num,
      total: fileRow.partCount,
      data: JSON.parse(partRow.data),
    });
  } catch (err) {
    req.log.error({ err }, "getFilePart error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
