export interface ParseSettings {
  maxCoordsPerPart: number;
  maxCharsPerPart: number;
  chunkMode: "off" | "1x1" | "2x2" | "3x3" | "4x4";
  entityMode: "off" | "nbt" | "eggs";
  blockEntityMode: boolean;
  biomeMode: boolean;
}

export const DEFAULT_SETTINGS: ParseSettings = {
  maxCoordsPerPart: 1024,
  maxCharsPerPart: 20000,
  chunkMode: "off",
  entityMode: "eggs",
  blockEntityMode: true,
  biomeMode: false,
};

/** 0–100 during parseLitematic (background uploads). */
export type ParseProgressReporter = (percent: number, stage: string) => void;

export interface ParsedLitematic {
  name: string;
  parts: string[];
  blockCount: number;
  entityCount: number;
  blockEntityCount: number;
  regionCount: number;
  blockTypes: Record<string, number>;
  entityTypes: Record<string, number>;
  blockEntityTypes: Record<string, number>;
  dimensions: { x: number; y: number; z: number };
}

export type Coord3 = [number, number, number];
export type EntityPlacement = [number, number, number, number, number];

export interface RegionContext {
  posX: number;
  posY: number;
  posZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}
