/** Max .litematic upload size (compressed). Override: MAX_LITEMATIC_UPLOAD_MB=100 */
export const MAX_LITEMATIC_UPLOAD_MB = Math.min(
  512,
  Math.max(1, parseInt(process.env.MAX_LITEMATIC_UPLOAD_MB ?? "100", 10) || 100),
);

export const MAX_LITEMATIC_UPLOAD_BYTES = MAX_LITEMATIC_UPLOAD_MB * 1024 * 1024;

/** Parts per INSERT batch (large schematics → thousands of parts). */
export const PARTS_DB_BATCH_SIZE = 50;
