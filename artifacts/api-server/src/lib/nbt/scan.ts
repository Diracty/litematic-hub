/**
 * Walk uncompressed big-endian NBT and extract byte ranges for each child
 * of the root "Regions" compound (Litematic / Sponge schematic).
 */
export type RegionByteSlice = {
  name: string;
  start: number;
  end: number;
};

function readU16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}

function readI32(buf: Buffer, off: number): number {
  return buf.readInt32BE(off);
}

/** Skip one tag payload; returns offset after payload. `tagType` is the type byte. */
export function skipTagPayload(buf: Buffer, off: number, tagType: number): number {
  switch (tagType) {
    case 0:
      return off;
    case 1:
      return off + 1;
    case 2:
      return off + 2;
    case 3:
    case 5:
      return off + 4;
    case 4:
    case 6:
      return off + 8;
    case 7: {
      const len = readI32(buf, off);
      return off + 4 + len;
    }
    case 8: {
      const len = readU16(buf, off);
      return off + 2 + len;
    }
    case 9: {
      const listType = buf.readUInt8(off);
      const count = readI32(buf, off + 1);
      let o = off + 5;
      for (let i = 0; i < count; i++) {
        o = skipTagPayload(buf, o, listType);
      }
      return o;
    }
    case 10: {
      let o = off;
      for (;;) {
        const childType = buf.readUInt8(o);
        if (childType === 0) return o + 1;
        const nameLen = readU16(buf, o + 1);
        const nameEnd = o + 3 + nameLen;
        o = skipTagPayload(buf, nameEnd, childType);
      }
    }
    case 11: {
      const len = readI32(buf, off);
      return off + 4 + len * 4;
    }
    case 12: {
      const len = readI32(buf, off);
      return off + 4 + len * 8;
    }
    default:
      throw new Error(`Unknown NBT tag type: ${tagType}`);
  }
}

/** Skip type + name + payload; `off` points at tag type byte. */
export function skipNamedTag(buf: Buffer, off: number): number {
  const tagType = buf.readUInt8(off);
  if (tagType === 0) return off + 1;
  const nameLen = readU16(buf, off + 1);
  const payloadStart = off + 3 + nameLen;
  return skipTagPayload(buf, payloadStart, tagType);
}

function readNamedTagName(buf: Buffer, off: number): { name: string; payloadStart: number; tagType: number } {
  const tagType = buf.readUInt8(off);
  const nameLen = readU16(buf, off + 1);
  const name = buf.toString("utf8", off + 3, off + 3 + nameLen);
  const payloadStart = off + 3 + nameLen;
  return { name, payloadStart, tagType };
}

/**
 * Returns byte slices covering each named region compound (type byte … end inclusive).
 */
export function extractRegionSlices(buf: Buffer): RegionByteSlice[] {
  let off = 0;
  const rootType = buf.readUInt8(off);
  if (rootType !== 10) {
    throw new Error("Root is not a compound NBT tag");
  }
  const rootNameLen = readU16(buf, off + 1);
  off = off + 3 + rootNameLen;

  let regionsPayloadStart = -1;

  for (;;) {
    const tagType = buf.readUInt8(off);
    if (tagType === 0) break;
    const { name, payloadStart, tagType: childType } = readNamedTagName(buf, off);
    if (name === "Regions" && childType === 10) {
      regionsPayloadStart = payloadStart;
      off = skipTagPayload(buf, payloadStart, childType);
      break;
    }
    off = skipTagPayload(buf, payloadStart, childType);
  }

  if (regionsPayloadStart < 0) {
    return [];
  }

  const slices: RegionByteSlice[] = [];
  let rOff = regionsPayloadStart;

  for (;;) {
    const tagType = buf.readUInt8(rOff);
    if (tagType === 0) break;
    const nameLen = readU16(buf, rOff + 1);
    const name = buf.toString("utf8", rOff + 3, rOff + 3 + nameLen);
    const tagStart = rOff;
    const payloadStart = rOff + 3 + nameLen;
    const tagEnd = skipTagPayload(buf, payloadStart, tagType);
    slices.push({ name, start: tagStart, end: tagEnd });
    rOff = tagEnd;
  }

  return slices;
}

/** Read schematic name without parsing the full NBT tree. */
export function extractSchematicName(buf: Buffer): string | undefined {
  let off = 0;
  const rootType = buf.readUInt8(off);
  if (rootType !== 10) return undefined;
  const rootNameLen = readU16(buf, off + 1);
  off = off + 3 + rootNameLen;

  for (;;) {
    const tagType = buf.readUInt8(off);
    if (tagType === 0) return undefined;
    const { name, payloadStart, tagType: childType } = readNamedTagName(buf, off);
    if (name === "Metadata" && childType === 10) {
      let mOff = payloadStart;
      for (;;) {
        const mType = buf.readUInt8(mOff);
        if (mType === 0) return undefined;
        const metaChild = readNamedTagName(buf, mOff);
        if (metaChild.name === "Name" && metaChild.tagType === 8) {
          const strLen = readU16(buf, metaChild.payloadStart);
          return buf.toString(
            "utf8",
            metaChild.payloadStart + 2,
            metaChild.payloadStart + 2 + strLen,
          );
        }
        mOff = skipTagPayload(buf, metaChild.payloadStart, metaChild.tagType);
      }
    }
    off = skipTagPayload(buf, payloadStart, childType);
  }
}
