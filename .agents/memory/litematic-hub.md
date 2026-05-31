---
name: Litematic Hub
description: Key decisions and quirks for the litematic .litematic file parser and hosting app.
---

## api-zod DOM lib fix

`lib/api-zod/tsconfig.json` must include `"lib": ["ES2022", "DOM"]`.
**Why:** Orval generates `zod.instanceof(File)` and `Blob` types for multipart endpoints — these only exist in DOM lib, causing TS2304 on typecheck:libs without it.

## Litematic NBT parsing

- Uses `prismarine-nbt` for NBT deserialization (returns typed tag objects with `{type, value}`).
- Long values come as `[high32, low32]` pairs; use `(BigInt(high >>> 0) << 32n) | BigInt(low >>> 0)` for correct unsigned conversion before bit operations.
- Block states use padded-long packing: `blocksPerLong = floor(64 / bitsPerBlock)`, values never cross long boundaries. Iteration order: Y → Z → X.
- Air blocks filtered: `minecraft:air`, `minecraft:cave_air`, `minecraft:void_air`.

## Storage design

- Parsed parts stored as minified JSON strings in `litematic_parts.data` (text column) in PostgreSQL.
- No filesystem storage for original files — only parsed parts are kept.
- Session-based (no auth): UUID generated client-side with `crypto.randomUUID()`, stored in localStorage key `litematic-session-id`.

## API layout

- `POST /api/files/upload` — multipart upload, returns key + stats
- `GET /api/files?sessionId=` — list user's files
- `GET /api/files/:key` / `DELETE /api/files/:key` — get/delete
- `GET /api/files/:key/download` — download all parsed parts as text file
- `GET /api/info/:key` — public: name + partCount
- `GET /api/part/:key/:number` — public: 1-indexed part JSON
