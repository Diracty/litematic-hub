import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = process.env.DATABASE_URL;
const needsSsl =
  databaseUrl.includes("supabase") ||
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("neon.tech");

const usePooler =
  databaseUrl.includes(":6543") || databaseUrl.includes("pooler.supabase.com");

export const pool = new Pool({
  connectionString: databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

/** Transaction pooler (6543) does not support prepared statements. */
export const db = drizzle(pool, {
  schema,
  ...(usePooler ? { prepare: false } : {}),
});

export * from "./schema";
