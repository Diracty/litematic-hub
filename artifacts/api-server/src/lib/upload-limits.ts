/** Max .litematic upload size (compressed). Override: MAX_LITEMATIC_UPLOAD_MB=100 */
export const MAX_LITEMATIC_UPLOAD_MB = Math.min(
  512,
  Math.max(1, parseInt(process.env.MAX_LITEMATIC_UPLOAD_MB ?? "100", 10) || 100),
);

export const MAX_LITEMATIC_UPLOAD_BYTES = MAX_LITEMATIC_UPLOAD_MB * 1024 * 1024;

/** Above this: accept upload immediately, parse in background (avoids proxy 502). */
export const ASYNC_UPLOAD_THRESHOLD_BYTES =
  (parseInt(process.env.ASYNC_UPLOAD_THRESHOLD_MB ?? "8", 10) || 8) * 1024 * 1024;

/** Parts per INSERT batch (large schematics → thousands of parts). */
export const PARTS_DB_BATCH_SIZE = 50;

/** Temp uploads + background parse files. */
export const UPLOAD_TMP_DIR = process.env.UPLOAD_TMP_DIR ?? "/tmp/litematic-uploads";

/**
 * Soft cap for hosted parse (RelaxDev ~1GB RAM). Override: HOSTING_MAX_UPLOAD_MB=100
 * Set 0 or very high to disable. Files above this are rejected before parse.
 */
export const HOSTING_MAX_UPLOAD_MB = Math.max(
  0,
  parseInt(process.env.HOSTING_MAX_UPLOAD_MB ?? "25", 10) || 25,
);

export const HOSTING_MAX_UPLOAD_BYTES =
  HOSTING_MAX_UPLOAD_MB > 0 ? HOSTING_MAX_UPLOAD_MB * 1024 * 1024 : Number.MAX_SAFE_INTEGER;

export const HOSTING_OOM_HINT =
  "Файл слишком тяжёлый для памяти сервера (~1 GB на бесплатном тарифе). " +
  "Уменьшите схему, разбейте регионы, или парсите локально (deploy/DOCKER-START.md). " +
  "На RelaxDev можно поднять HOSTING_MAX_UPLOAD_MB и RAM в платном тарифе.";
