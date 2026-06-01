import { fork, type ChildProcess } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedLitematic } from "./litematic/types.js";
import type { ParseProgressReporter } from "./litematic/types.js";
import { UPLOAD_TMP_DIR } from "./upload-limits.js";

/** Bundled next to index.mjs in dist/. */
const workerPath = join(dirname(fileURLToPath(import.meta.url)), "parse-worker-child.mjs");

function parseHeapMb(): number {
  const n = parseInt(process.env.PARSE_HEAP_MB ?? "1024", 10);
  return Number.isFinite(n) && n >= 256 ? n : 1200;
}

function formatChildFailure(code: number | null, errText: string): string {
  if (errText.trim() && !errText.startsWith("Parse process exited")) {
    return errText.trim();
  }
  if (code === null || code === 137 || code === 134) {
    return (
      "Процесс парсинга убит сервером (нехватка оперативной памяти). " +
      "В RelaxDev в Environment: PARSE_HEAP_MB=1400, убери NODE_OPTIONS, полный редеплой. " +
      "Если снова падает — бесплатному контейнеру может не хватить RAM на файл ~30 МБ."
    );
  }
  return `Парсинг завершился с ошибкой (код ${code ?? "неизвестен"})`;
}

export function runParseInSubprocess(
  jobId: string,
  onProgress?: ParseProgressReporter,
): Promise<ParsedLitematic> {
  const resultPath = join(UPLOAD_TMP_DIR, "jobs", `${jobId}.result.json`);
  const errorPath = join(UPLOAD_TMP_DIR, "jobs", `${jobId}.error.txt`);

  return new Promise((resolve, reject) => {
    const heapMb = parseHeapMb();
    let child: ChildProcess;

    try {
      child = fork(workerPath, [jobId], {
        execArgv: [`--max-old-space-size=${heapMb}`, "--enable-source-maps"],
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          UPLOAD_TMP_DIR,
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    } catch (err) {
      reject(err);
      return;
    }

    child.on("message", (msg: unknown) => {
      if (
        msg &&
        typeof msg === "object" &&
        (msg as { type?: string }).type === "progress"
      ) {
        const { pct, stage } = msg as { pct: number; stage: string };
        onProgress?.(pct, stage);
      }
    });

    child.stdout?.on("data", (d: Buffer) => {
      process.stdout.write(d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      process.stderr.write(d);
    });

    child.on("error", reject);

    child.on("exit", (code) => {
      void (async () => {
        if (code === 0) {
          try {
            const raw = await readFile(resultPath, "utf-8");
            resolve(JSON.parse(raw) as ParsedLitematic);
          } catch (e) {
            reject(e);
          } finally {
            await unlink(resultPath).catch(() => undefined);
            await unlink(errorPath).catch(() => undefined);
          }
          return;
        }

        let errText = "";
        try {
          errText = await readFile(errorPath, "utf-8");
        } catch {
          /* no error file */
        }
        await unlink(resultPath).catch(() => undefined);
        await unlink(errorPath).catch(() => undefined);
        reject(new Error(formatChildFailure(code, errText)));
      })().catch(reject);
    });
  });
}
