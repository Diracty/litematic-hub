import type { ParseSettings } from "./litematic/types.js";

const TWENTY_MB = 20 * 1024 * 1024;

/** Reduce RAM after NBT for large uploads on small containers (RelaxDev free). */
export function applyMemorySafeParseSettings(
  sizeBytes: number,
  settings: ParseSettings,
): ParseSettings {
  if (sizeBytes < TWENTY_MB) return settings;

  return {
    ...settings,
    chunkMode: settings.chunkMode === "off" ? "2x2" : settings.chunkMode,
    entityMode: settings.entityMode === "eggs" ? "off" : settings.entityMode,
    blockEntityMode: false,
    biomeMode: false,
  };
}
