import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parseLitematic } from "./litematic-parser.js";
import type { ParseSettings } from "./litematic/types.js";
import { logger } from "./logger.js";
import { persistParsedUpload, type PersistedUpload } from "./persist-parsed.js";
import { uploadParseErrorMessage } from "./upload-errors.js";
import { ASYNC_UPLOAD_THRESHOLD_BYTES, UPLOAD_TMP_DIR } from "./upload-limits.js";

export type UploadJobStatus = "queued" | "processing" | "done" | "failed";

export type UploadJob = {
  jobId: string;
  sessionId: string;
  status: UploadJobStatus;
  error?: string;
  result?: PersistedUpload;
  sizeBytes: number;
  createdAt: number;
  /** 0–100 while status is processing */
  progress: number;
  stage: string;
};

const jobs = new Map<string, UploadJob>();
const jobSettings = new Map<string, ParseSettings>();
const jobMeta = new Map<string, { originalFilename: string; sizeBytes: number }>();
const pending: string[] = [];
let draining = false;

export function shouldUseAsyncUpload(sizeBytes: number): boolean {
  return sizeBytes >= ASYNC_UPLOAD_THRESHOLD_BYTES;
}

export function getUploadJob(jobId: string): UploadJob | undefined {
  return jobs.get(jobId);
}

export async function enqueueUploadJob(opts: {
  jobId: string;
  sessionId: string;
  originalFilename: string;
  settings: ParseSettings;
  sizeBytes: number;
}): Promise<string> {
  const { jobId } = opts;

  jobs.set(jobId, {
    jobId,
    sessionId: opts.sessionId,
    status: "queued",
    sizeBytes: opts.sizeBytes,
    createdAt: Date.now(),
    progress: 0,
    stage: "queued",
  });
  jobSettings.set(jobId, opts.settings);
  jobMeta.set(jobId, {
    originalFilename: opts.originalFilename,
    sizeBytes: opts.sizeBytes,
  });

  pending.push(jobId);
  void drainQueue();

  return jobId;
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;

  while (pending.length > 0) {
    const jobId = pending.shift()!;
    await runJob(jobId);
  }

  draining = false;
}

async function runJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  const path = join(UPLOAD_TMP_DIR, `${jobId}.litematic`);
  job.status = "processing";
  job.progress = 0;
  job.stage = "starting";

  const started = Date.now();
  const settings = jobSettings.get(jobId);
  const meta = jobMeta.get(jobId);

  try {
    if (!settings || !meta) {
      throw new Error("Missing job metadata");
    }

    const buffer = await readFile(path);

    logger.info(
      { jobId, sizeBytes: buffer.length, name: meta.originalFilename },
      "background parse started",
    );

    const parsed = await parseLitematic(buffer, settings, (percent, stage) => {
      job.progress = percent;
      job.stage = stage;
    });

    job.stage = "database";
    job.progress = 99;

    const result = await persistParsedUpload(parsed, {
      sessionId: job.sessionId,
      originalFilename: meta.originalFilename,
      sizeBytes: meta.sizeBytes,
      settings,
    });

    job.status = "done";
    job.progress = 100;
    job.stage = "done";
    job.result = result;

    logger.info(
      {
        jobId,
        key: result.key,
        partCount: result.partCount,
        ms: Date.now() - started,
      },
      "background parse finished",
    );
  } catch (err) {
    job.status = "failed";
    job.error = uploadParseErrorMessage(err);
    logger.error({ err, jobId, ms: Date.now() - started }, "background parse failed");
  } finally {
    jobSettings.delete(jobId);
    jobMeta.delete(jobId);
    await unlink(path).catch(() => undefined);
  }
}
