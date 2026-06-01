import type { ParseSettings } from "./types.js";

export function chunkGroupSize(mode: ParseSettings["chunkMode"]): number {
  switch (mode) {
    case "1x1":
      return 1;
    case "2x2":
      return 2;
    case "3x3":
      return 3;
    case "4x4":
      return 4;
    default:
      return 0;
  }
}

export function chunkKey(x: number, z: number, groupSize: number): string {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  if (groupSize <= 1) return `${cx},${cz}`;
  return `${Math.floor(cx / groupSize)},${Math.floor(cz / groupSize)}`;
}

export function compareChunkKeys(a: string, b: string): number {
  const [ax, az] = a.split(",").map(Number);
  const [bx, bz] = b.split(",").map(Number);
  return ax - bx || az - bz;
}
