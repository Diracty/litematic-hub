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

export const pool = new Pool({
  connectionString: databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
