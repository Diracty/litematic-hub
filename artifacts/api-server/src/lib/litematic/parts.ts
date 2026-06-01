import type { Coord3 } from "./types.js";

export class PartBuilder {
  private parts: string[] = [];
  private current: string[] = [];
  private currentCoords = 0;
  private currentChars = 2;

  constructor(
    private readonly maxCoords: number,
    private readonly maxChars: number
  ) {}

  flush(): void {
    if (this.current.length === 0) return;
    this.parts.push("[" + this.current.join(",") + "]");
    this.current = [];
    this.currentCoords = 0;
    this.currentChars = 2;
  }

  finishChunk(): void {
    this.flush();
  }

  private tryAdd(entry: string, coords: number): boolean {
    const sep = this.current.length > 0 ? 1 : 0;
    if (
      this.current.length > 0 &&
      (this.currentCoords + coords > this.maxCoords ||
        this.currentChars + sep + entry.length > this.maxChars)
    ) {
      return false;
    }
    this.current.push(entry);
    this.currentCoords += coords;
    this.currentChars += sep + entry.length;
    return true;
  }

  addBlockType(id: string, allCoords: Coord3[]): void {
    let offset = 0;
    while (offset < allCoords.length) {
      const remainCoords = this.maxCoords - this.currentCoords;

      if (remainCoords <= 0) {
        this.flush();
        continue;
      }

      let take = Math.min(remainCoords, allCoords.length - offset);
      while (take > 0) {
        const slice = allCoords.slice(offset, offset + take);
        const entry = JSON.stringify({ type: "block", id, coords: slice });

        if (entry.length + 2 <= this.maxChars || take === 1) {
          if (!this.tryAdd(entry, take)) {
            this.flush();
            if (!this.tryAdd(entry, take)) {
              this.current.push(entry);
              this.currentCoords = take;
              this.currentChars = 2 + entry.length;
              this.flush();
            }
          }
          offset += take;
          break;
        }
        take = Math.max(1, Math.floor(take / 2));
      }
    }
  }

  addLast(entry: string, coords: number): void {
    if (!this.tryAdd(entry, coords)) {
      this.flush();
      if (!this.tryAdd(entry, coords)) {
        this.current.push(entry);
        this.currentCoords = coords;
        this.currentChars = 2 + entry.length;
        this.flush();
      }
    }
  }

  getParts(): string[] {
    this.flush();
    return this.parts;
  }
}

export function addBatchedJsonEntries(
  builder: PartBuilder,
  maxChars: number,
  items: unknown[],
  buildEntry: (batch: unknown[]) => string,
  coordCount: (batch: unknown[]) => number
): void {
  let batch: unknown[] = [];

  const flushBatch = (): void => {
    if (batch.length === 0) return;
    builder.addLast(buildEntry(batch), coordCount(batch));
    batch = [];
  };

  for (const item of items) {
    const next = [...batch, item];
    const nextJson = buildEntry(next);
    if (nextJson.length + 2 > maxChars && batch.length > 0) {
      flushBatch();
      batch = [item];
      const singleJson = buildEntry(batch);
      if (singleJson.length + 2 > maxChars) {
        flushBatch();
      }
    } else if (nextJson.length + 2 > maxChars) {
      batch = [item];
      flushBatch();
    } else {
      batch = next;
    }
  }
  flushBatch();
}
