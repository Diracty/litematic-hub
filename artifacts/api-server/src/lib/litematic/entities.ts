import type { NbtCompound } from "../nbt/types.js";
import { compoundToJson, jsonValue } from "../nbt/convert.js";
import {
  entityPlacementToSchematic,
  readEntityPos,
  readEntityRotation,
  type RegionContext,
} from "./regions.js";
import type { EntityPlacement } from "./types.js";

export const CARRIER_SPAWN_EGG = "minecraft:bat_spawn_egg";

/**
 * entity_data: compoundToJson → buildEntityDataFromRaw → egg.
 * Every tag from the schematic is kept (Variant:0, Sitting:0, OnGround:0, …).
 * Only placement / merge keys are removed — never “empty” or “vanilla default” filtering.
 */
const ENTITY_NBT_STRIP = new Set([
  "Pos",
  "Motion",
  "Rotation",
  "Id",
  "UUID",
  "UUIDMost",
  "UUIDLeast",
  "RootVehicle",
]);

function copyEntityTag(key: string, value: unknown): unknown {
  return jsonValue(value);
}

function finalizeEntityData(data: Record<string, unknown>): Record<string, unknown> {
  const rawId = String(data.id ?? data.Id ?? "minecraft:pig");
  const entityId = rawId.includes(":") ? rawId : `minecraft:${rawId}`;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "Id") continue;
    out[k] = copyEntityTag(k, v);
  }
  out.id = entityId;
  return out;
}

const ATTACHMENT_SUFFIX = new Set([
  "item_frame",
  "glow_item_frame",
  "painting",
  "leash_knot",
]);

function ensureNamespacedId(id: string): string {
  if (!id) return "minecraft:air";
  return id.includes(":") ? id : `minecraft:${id}`;
}

function toJsonNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function entityIdFromNbt(nbt: Record<string, unknown>): string {
  const raw = nbt["id"] ?? nbt["Id"];
  if (typeof raw === "string" && raw.length > 0) {
    return ensureNamespacedId(raw);
  }
  return "minecraft:pig";
}

function transformAttachmentCoords(
  data: Record<string, unknown>,
  ctx: RegionContext
): void {
  const id = String(data["id"] ?? "");
  const base = id.replace(/^minecraft:/, "");
  if (!ATTACHMENT_SUFFIX.has(base)) return;

  if (typeof data["TileX"] === "number") {
    data["TileX"] = ctx.posX + (data["TileX"] as number);
  }
  if (typeof data["TileY"] === "number") {
    data["TileY"] = ctx.posY + (data["TileY"] as number);
  }
  if (typeof data["TileZ"] === "number") {
    data["TileZ"] = ctx.posZ + (data["TileZ"] as number);
  }
  if (Array.isArray(data["block_pos"]) && data["block_pos"].length >= 3) {
    data["block_pos"] = [
      ctx.posX + Number(data["block_pos"][0]),
      ctx.posY + Number(data["block_pos"][1]),
      ctx.posZ + Number(data["block_pos"][2]),
    ];
  }
}

function formatUuidFromParts(msb: bigint, lsb: bigint): string {
  const mask = (1n << 64n) - 1n;
  const m = msb & mask;
  const l = lsb & mask;
  const pad = (n: bigint, len: number) => n.toString(16).padStart(len, "0");
  return (
    `${pad(m >> 32n, 8)}-${pad((m >> 16n) & 0xffffn, 4)}-${pad(m & 0xffffn, 4)}-` +
    `${pad(l >> 48n, 4)}-${pad(l & 0xffffffffffffn, 12)}`
  );
}

function nbtUuidIntsToString(ints: number[]): string | null {
  if (ints.length < 4) return null;
  const msb = (BigInt(ints[0] | 0) << 32n) | BigInt(ints[1] >>> 0);
  const lsb = (BigInt(ints[2] | 0) << 32n) | BigInt(ints[3] >>> 0);
  return formatUuidFromParts(msb, lsb);
}

function extractEntityUuid(nbt: Record<string, unknown>): string | null {
  const uuid = nbt["UUID"];
  if (Array.isArray(uuid) && uuid.length >= 4) {
    return nbtUuidIntsToString(uuid.map((v) => toJsonNumber(v)));
  }
  if (nbt["UUIDMost"] !== undefined && nbt["UUIDLeast"] !== undefined) {
    const msb = BigInt.asUintN(
      64,
      BigInt(Math.trunc(toJsonNumber(nbt["UUIDMost"])))
    );
    const lsb = BigInt.asUintN(
      64,
      BigInt(Math.trunc(toJsonNumber(nbt["UUIDLeast"])))
    );
    return formatUuidFromParts(msb, lsb);
  }
  return null;
}

function extractRootVehicleAttach(nbt: Record<string, unknown>): string | null {
  const rv = nbt["RootVehicle"];
  if (!rv || typeof rv !== "object" || Array.isArray(rv)) return null;
  const attach = (rv as Record<string, unknown>)["Attach"];
  if (Array.isArray(attach) && attach.length >= 4) {
    return nbtUuidIntsToString(attach.map((v) => toJsonNumber(v)));
  }
  return null;
}

function collectNestedPassengerUuids(nbt: Record<string, unknown>): Set<string> {
  const uuids = new Set<string>();
  const walk = (node: Record<string, unknown>): void => {
    const u = extractEntityUuid(node);
    if (u) uuids.add(u);
    if (Array.isArray(node["Passengers"])) {
      for (const p of node["Passengers"] as unknown[]) {
        if (p && typeof p === "object" && !Array.isArray(p)) {
          walk(p as Record<string, unknown>);
        }
      }
    }
  };
  if (Array.isArray(nbt["Passengers"])) {
    for (const p of nbt["Passengers"] as unknown[]) {
      if (p && typeof p === "object" && !Array.isArray(p)) {
        walk(p as Record<string, unknown>);
      }
    }
  }
  return uuids;
}

function passengerMergeDepth(
  parentIdx: Map<number, number>,
  i: number,
  visiting = new Set<number>()
): number {
  const p = parentIdx.get(i);
  if (p === undefined) return 0;
  if (visiting.has(i)) return 0;
  visiting.add(i);
  return 1 + passengerMergeDepth(parentIdx, p, visiting);
}

export function buildEntityDataFromRaw(
  raw: Record<string, unknown>,
  ctx: RegionContext
): Record<string, unknown> {
  const id = entityIdFromNbt(raw);
  const data: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(raw)) {
    if (k === "Passengers" || ENTITY_NBT_STRIP.has(k)) continue;
    data[k] = copyEntityTag(k, v);
  }
  data.id = id;
  transformAttachmentCoords(data, ctx);

  if (Array.isArray(raw.Passengers)) {
    const passengers = (raw.Passengers as unknown[]).filter(
      (p): p is Record<string, unknown> =>
        p !== null && typeof p === "object" && !Array.isArray(p)
    );
    if (passengers.length > 0) {
      data.Passengers = passengers.map((p) => buildEntityDataFromRaw(p, ctx));
    }
  }

  return finalizeEntityData(data);
}

export function mergeEntitiesInRegion(
  compounds: NbtCompound[],
  ctx: RegionContext
): Array<{ pos: EntityPlacement; nbt: Record<string, unknown> }> {
  if (compounds.length === 0) return [];

  const entries = compounds.map((compound) => ({
    raw: compoundToJson(compound),
    compound,
  }));

  const uuidToIdx = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const u = extractEntityUuid(entries[i].raw);
    if (u && !uuidToIdx.has(u)) uuidToIdx.set(u, i);
  }

  const parentIdx = new Map<number, number>();
  for (let i = 0; i < entries.length; i++) {
    const attachUuid = extractRootVehicleAttach(entries[i].raw);
    if (!attachUuid) continue;
    const vehicleIdx = uuidToIdx.get(attachUuid);
    if (vehicleIdx !== undefined && vehicleIdx !== i) {
      parentIdx.set(i, vehicleIdx);
    }
  }

  const skipTopLevel = new Set<number>();

  const passengerIndices = [...parentIdx.keys()].sort(
    (a, b) => passengerMergeDepth(parentIdx, b) - passengerMergeDepth(parentIdx, a)
  );

  for (const i of passengerIndices) {
    const vehicleIdx = parentIdx.get(i)!;
    const passengerRaw = entries[i].raw;
    const passengerUuid = extractEntityUuid(passengerRaw);

    if (
      passengerUuid &&
      collectNestedPassengerUuids(entries[vehicleIdx].raw).has(passengerUuid)
    ) {
      skipTopLevel.add(i);
      continue;
    }

    const merged: Record<string, unknown> = { ...passengerRaw };
    delete merged["RootVehicle"];

    if (!Array.isArray(entries[vehicleIdx].raw["Passengers"])) {
      entries[vehicleIdx].raw["Passengers"] = [];
    }
    (entries[vehicleIdx].raw["Passengers"] as unknown[]).push(merged);
    skipTopLevel.add(i);
  }

  for (let i = 0; i < entries.length; i++) {
    if (skipTopLevel.has(i)) continue;
    const uuid = extractEntityUuid(entries[i].raw);
    if (!uuid) continue;
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      if (collectNestedPassengerUuids(entries[j].raw).has(uuid)) {
        skipTopLevel.add(i);
        break;
      }
    }
  }

  const result: Array<{ pos: EntityPlacement; nbt: Record<string, unknown> }> =
    [];
  for (let i = 0; i < entries.length; i++) {
    if (skipTopLevel.has(i)) continue;
    const entNbt = buildEntityDataFromRaw(entries[i].raw, ctx);
    const [ex, ey, ez] = readEntityPos(entries[i].compound);
    const [yaw, pitch] = readEntityRotation(entries[i].compound);
    const pos = entityPlacementToSchematic(ex, ey, ez, yaw, pitch, ctx);
    result.push({ pos, nbt: entNbt });
  }
  return result;
}

export function entityToEgg(entityNbt: Record<string, unknown>): unknown {
  const id = entityIdFromNbt(entityNbt);
  return {
    id: CARRIER_SPAWN_EGG,
    count: 1,
    components: { "minecraft:entity_data": { ...entityNbt, id } },
  };
}
