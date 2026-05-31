import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const litematicFilesTable = pgTable("litematic_files", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(),
  sessionId: text("session_id").notNull(),
  name: text("name").notNull(),
  originalFilename: text("original_filename"),
  sizeBytes: integer("size_bytes").notNull(),
  partCount: integer("part_count").notNull().default(0),
  blockCount: integer("block_count").notNull().default(0),
  entityCount: integer("entity_count").notNull().default(0),
  blockEntityCount: integer("block_entity_count").notNull().default(0),
  regionCount: integer("region_count").notNull().default(0),
  blockTypes: jsonb("block_types").default({}),
  entityTypes: jsonb("entity_types").default({}),
  blockEntityTypes: jsonb("block_entity_types").default({}),
  dimensionsX: integer("dimensions_x").default(0),
  dimensionsY: integer("dimensions_y").default(0),
  dimensionsZ: integer("dimensions_z").default(0),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("litematic_files_session_idx").on(t.sessionId),
  index("litematic_files_key_idx").on(t.key),
]);

export const litematicPartsTable = pgTable("litematic_parts", {
  id: serial("id").primaryKey(),
  fileKey: text("file_key").notNull().references(() => litematicFilesTable.key, { onDelete: "cascade" }),
  partNumber: integer("part_number").notNull(),
  data: text("data").notNull(),
}, (t) => [
  index("litematic_parts_key_idx").on(t.fileKey),
]);

export const insertLitematicFileSchema = createInsertSchema(litematicFilesTable).omit({ id: true, createdAt: true });
export type InsertLitematicFile = z.infer<typeof insertLitematicFileSchema>;
export type LitematicFileRow = typeof litematicFilesTable.$inferSelect;
export type LitematicPartRow = typeof litematicPartsTable.$inferSelect;
