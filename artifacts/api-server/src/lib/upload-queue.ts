import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parseLitematicFromPath } from "./litematic-parser.js";
import type { ParseSettings } from "./litematic/types.js";
import { logger } from "./logger.js";
import { persistParsedUpload } from "./persist-parsed.js";
import { uploadParseErrorMessage } from "./upload-errors.js";
import {
  ASYNC_UPLOAD_THRESHOLD_BYTES,
  HOSTING_OOM_HINT,
  UPLOAD_TMP_DIR,
} from "./upload-limits.js";
import {
  deleteUploadJob,
  ensureJobsDir,
  listUploadJobIds,
  loadUploadJob,
  patchJob,
  saveUploadJob,
  toPublicJob,
  type UploadJob,
  type UploadJobRecord,
} from "./upload-job-store.js";

export type { UploadJob, UploadJobStatus } from "./upload-job-store.js";

const jobs = new Map<string, UploadJobRecord>();
const pending: string[] = [];
let draining = false;
let lastProgressWrite = new Map<string, number>();

export function shouldUseAsyncUpload(sizeBytes: number): boolean {
  return sizeBytes >= ASYNC_UPLOAD_THRESHOLD_BYTES;
}

export async function getUploadJob(jobId: string): Promise<UploadJob | undefined> {
  let record = jobs.get(jobId);
  if (!record) {
    record = await loadUploadJob(jobId);
    if (record) jobs.set(jobId, record);
  }
  return record ? toPublicJob(record) : undefined;
}

async function persistJob(record: UploadJobRecord): Promise<void> {
  jobs.set(record.jobId, record);
  await saveUploadJob(record);
}

async function persistProgress(
  record: UploadJobRecord,
  percent: number,
  stage: string,
): Promise<void> {
  const prevPct = record.progress;
  const prevStage = record.stage;
  record.progress = percent;
  record.stage = stage;
  jobs.set(record.jobId, record);

  const now = Date.now();
  const last = lastProgressWrite.get(record.jobId) ?? 0;
  if (
    percent >= 100 ||
    percent - prevPct >= 3 ||
    stage !== prevStage ||
    now - last >= 2000
  ) {
    lastProgressWrite.set(record.jobId, now);
    await saveUploadJob(record).catch((err) => {
      logger.warn({ err, jobId: record.jobId }, "failed to persist job progress");
    });
  }
}

export async function enqueueUploadJob(opts: {
  jobId: string;
  sessionId: string;
  originalFilename: string;
  settings: ParseSettings;
  sizeBytes: number;
}): Promise<string> {
  const { jobId } = opts;

  const record: UploadJobRecord = {
    jobId,
    sessionId: opts.sessionId,
    status: "queued",
    sizeBytes: opts.sizeBytes,
    createdAt: Date.now(),
    progress: 0,
    stage: "queued",
    originalFilename: opts.originalFilename,
    settings: opts.settings,
  };

  await persistJob(record);

  pending.push(jobId);
  void drainQueue();

  return jobId;
}

export async function resumePendingUploadJobs(): Promise<void> {
  await ensureJobsDir();
  const ids = await listUploadJobIds();

  for (const jobId of ids) {
    const record = await loadUploadJob(jobId);
    if (!record) continue;

    jobs.set(jobId, record);

    if (record.status === "done" || record.status === "failed") {
      continue;
    }

    const litematicPath = join(UPLOAD_TMP_DIR, `${jobId}.litematic`);
    let hasFile = false;
    try {
      await access(litematicPath);
      hasFile = true;
    } catch {
      hasFile = false;
    }

    if (!hasFile) {
      const failed = patchJob(record, {
        status: "failed",
        error: "Upload interrupted (server restarted). Please upload the file again.",
        stage: "failed",
      });
      await persistJob(failed);
      continue;
    }

    let job = record;

    if (job.status === "processing") {
      const failed = patchJob(job, {
        status: "failed",
        error: HOSTING_OOM_HINT,
        stage: "failed",
        progress: 0,
      });
      await persistJob(failed);
      await unlink(litematicPath).catch(() => undefined);
      logger.warn({ jobId }, "aborted stale processing job after server restart (OOM prevention)");
      continue;
    }

    if (job.status !== "queued") {
      continue;
    }

    if (!pending.includes(jobId)) {
      pending.push(jobId);
    }
  }

  if (pending.length > 0) {
    logger.info({ count: pending.length }, "resuming background upload jobs");
    void drainQueue();
  }
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
  let record = jobs.get(jobId) ?? (await loadUploadJob(jobId));
  if (!record) return;

  const path = join(UPLOAD_TMP_DIR, `${jobId}.litematic`);

  record = patchJob(record, {
    status: "processing",
    progress: 0,
    stage: "starting",
  });
  await persistJob(record);

  const started = Date.now();
  const { settings, originalFilename } = record;

  try {
    logger.info(
      { jobId, sizeBytes: record.sizeBytes, name: originalFilename },
      "background parse started",
    );

    const parsed = await parseLitematicFromPath(path, settings, (percent, stage) => {
      const current = jobs.get(jobId);
      if (current) void persistProgress(current, percent, stage);
    });

    record = patchJob(jobs.get(jobId) ?? record, {
      stage: "database",
      progress: 99,
    });
    await persistJob(record);

    const result = await persistParsedUpload(parsed, {
      sessionId: record.sessionId,
      originalFilename,
      sizeBytes: record.sizeBytes,
      settings,
    });

    record = patchJob(record, {
      status: "done",
      progress: 100,
      stage: "done",
      result,
    });
    await persistJob(record);

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
    record = patchJob(jobs.get(jobId) ?? record, {
      status: "failed",
      error: uploadParseErrorMessage(err),
      stage: "failed",
    });
    await persistJob(record);
    logger.error({ err, jobId, ms: Date.now() - started }, "background parse failed");
  } finally {
    lastProgressWrite.delete(jobId);
    await unlink(path).catch(() => undefined);
    setTimeout(() => {
      void deleteUploadJob(jobId);
    }, 60 * 60 * 1000);
  }
}
