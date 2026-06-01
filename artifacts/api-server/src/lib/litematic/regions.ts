import type { NbtCompound } from "../nbt/types.js";
import { getInt, getCompound, readTagNumberList } from "../nbt/read.js";
import type { Coord3, EntityPlacement, RegionContext } from "./types.js";

export function regionLocalToWorld(
  local: number,
  rPos: number,
  rSize: number
): number {
  return rPos + (rSize < 0 ? local + rSize + 1 : local);
}

export function readRegionContext(region: NbtCompound): RegionContext {
  const posTag = getCompound(region, "Position");
  const sizeTag = getCompound(region, "Size");
  return {
    posX: getInt(posTag, "x") || getInt(posTag, "X"),
    posY: getInt(posTag, "y") || getInt(posTag, "Y"),
    posZ: getInt(posTag, "z") || getInt(posTag, "Z"),
    sizeX: getInt(sizeTag, "x") || getInt(sizeTag, "X"),
    sizeY: getInt(sizeTag, "y") || getInt(sizeTag, "Y"),
    sizeZ: getInt(sizeTag, "z") || getInt(sizeTag, "Z"),
  };
}

export function localBlockIndexToWorld(
  lx: number,
  ly: number,
  lz: number,
  ctx: RegionContext
): Coord3 {
  return [
    regionLocalToWorld(lx, ctx.posX, ctx.sizeX),
    regionLocalToWorld(ly, ctx.posY, ctx.sizeY),
    regionLocalToWorld(lz, ctx.posZ, ctx.sizeZ),
  ];
}

export function entityPlacementToSchematic(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  ctx: RegionContext
): EntityPlacement {
  return [ctx.posX + x, ctx.posY + y, ctx.posZ + z, yaw, pitch];
}

export function readEntityPos(entCompound: NbtCompound): [number, number, number] {
  const pv = readTagNumberList(entCompound, "Pos");
  if (pv.length >= 3) return [pv[0], pv[1], pv[2]];
  return [0, 0, 0];
}

function facingToYaw(facing: number): number {
  switch (facing) {
    case 2:
      return 180;
    case 3:
      return 0;
    case 4:
      return 90;
    case 5:
      return -90;
    default:
      return 0;
  }
}

export function readEntityRotation(
  entCompound: NbtCompound
): [number, number] {
  const rv = readTagNumberList(entCompound, "Rotation");
  if (rv.length >= 2) return [rv[0], rv[1]];
  if (entCompound["Facing"]) {
    return [facingToYaw(getInt(entCompound, "Facing")), 0];
  }
  return [0, 0];
}
