import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function poolSsl(host: string): pg.PoolConfig["ssl"] {
  const needsSsl =
    host.includes("supabase") ||
    host.includes("neon.tech") ||
    process.env.PGSSLMODE === "require";
  return needsSsl ? { rejectUnauthorized: false } : undefined;
}

function buildPoolConfig(): pg.PoolConfig {
  const host = process.env.PGHOST;
  const password = process.env.PGPASSWORD;

  if (host && password) {
    const port = Number(process.env.PGPORT ?? "5432");
    const user = process.env.PGUSER ?? "postgres";
    const database = process.env.PGDATABASE ?? "postgres";
    return {
      host,
      port,
      user,
      password,
      database,
      ssl: poolSsl(host),
    };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Set DATABASE_URL or PGHOST + PGPASSWORD (+ PGUSER, PGPORT, PGDATABASE).",
    );
  }

  const needsSsl =
    databaseUrl.includes("supabase") ||
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("sslmode=require");

  return {
    connectionString: databaseUrl,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const poolConfig = buildPoolConfig();
const host =
  "host" in poolConfig && poolConfig.host
    ? poolConfig.host
    : process.env.DATABASE_URL ?? "";
const usePooler =
  (poolConfig.port === 6543) ||
  host.includes("pooler.supabase.com") ||
  (process.env.DATABASE_URL?.includes(":6543") ?? false);

export const pool = new Pool(poolConfig);

/** Transaction pooler (6543) does not support prepared statements. */
export const db = drizzle(pool, {
  schema,
  ...(usePooler ? { prepare: false } : {}),
});

export * from "./schema";
