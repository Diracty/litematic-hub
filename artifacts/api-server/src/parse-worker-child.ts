/**
 * Separate Node process for large parses — own heap, parent stays small.
 * Started via child_process.fork from upload-queue.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseLitematicFromPath } from "./lib/litematic-parser.js";
import { UPLOAD_TMP_DIR } from "./lib/upload-limits.js";

const jobId = process.argv[2];
if (!jobId) {
  console.error("usage: parse-worker-child <jobId>");
  process.exit(2);
}

const tmp = UPLOAD_TMP_DIR;
const jobPath = join(tmp, "jobs", `${jobId}.json`);
const resultPath = join(tmp, "jobs", `${jobId}.result.json`);
const errorPath = join(tmp, "jobs", `${jobId}.error.txt`);

async function main(): Promise<void> {
  const job = JSON.parse(await readFile(jobPath, "utf-8")) as {
    settings: import("./lib/litematic/types.js").ParseSettings;
  };

  const parsed = await parseLitematicFromPath(
    join(tmp, `${jobId}.litematic`),
    job.settings,
    (pct, stage) => {
      process.send?.({ type: "progress", pct, stage });
    },
  );

  await writeFile(resultPath, JSON.stringify(parsed), "utf-8");
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    await writeFile(errorPath, msg, "utf-8").catch(() => undefined);
    console.error(err);
    process.exit(1);
  });
