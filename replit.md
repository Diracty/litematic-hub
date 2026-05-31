# Litematic Hub

A web service for uploading, parsing, and sharing Minecraft Litematica `.litematic` files. Files are parsed into numbered JSON "parts" and each gets a unique UUID key for sharing.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/litematic-hub run dev` — run the frontend (port 23755)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- NBT parsing: `prismarine-nbt` + custom litematic block-state decoder
- File uploads: `multer` (memory storage, 50MB limit)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/litematic.ts` — DB schema (litematic_files, litematic_parts tables)
- `artifacts/api-server/src/lib/litematic-parser.ts` — Litematic parser (NBT decode → JSON parts)
- `artifacts/api-server/src/routes/files.ts` — upload/list/get/delete/download routes
- `artifacts/api-server/src/routes/info.ts` — /info/:key and /part/:key/:number routes
- `artifacts/litematic-hub/src/` — React + Vite frontend

## Architecture decisions

- Parts stored as minified JSON strings in PostgreSQL (text column) — avoids filesystem complexity and enables easy retrieval by part number.
- Session-based storage: no auth required; session UUID generated client-side with `crypto.randomUUID()` and persisted in localStorage.
- Litematic parsing uses padded-long bit packing (values don't cross 64-bit boundaries), matching litematica's internal format for all versions.
- Block entity filter: only writes non-structural tags (excludes `id`, `x`, `y`, `z`, `keepPacked`, `DataVersion`).

## Product

- Upload `.litematic` files up to 50MB with configurable parse settings
- Parsed into numbered JSON parts: blocks (with all block states), entities (NBT or spawn eggs), block entities (non-default tags), optional biomes
- Per-session file storage: copy key, view parts, download, delete
- Public API: `GET /api/info/:key` (name + part count), `GET /api/part/:key/:number` (part JSON)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `lib/api-zod/tsconfig.json` includes `"lib": ["ES2022", "DOM"]` — required because Orval generates `File`/`Blob` types for multipart endpoints that only exist in the DOM lib.
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`.
- The litematic parser handles NBT long arrays as `[high32, low32]` pairs from prismarine-nbt; use `>>> 0` for unsigned conversion before BigInt operations.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
