import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ParseSettings } from "./litematic/types.js";
import type { PersistedUpload } from "./persist-parsed.js";
import { UPLOAD_TMP_DIR } from "./upload-limits.js";

export type UploadJobStatus = "queued" | "processing" | "done" | "failed";

export type UploadJob = {
  jobId: string;
  sessionId: string;
  status: UploadJobStatus;
  error?: string;
  result?: PersistedUpload;
  sizeBytes: number;
  createdAt: number;
  progress: number;
  stage: string;
};

export type UploadJobRecord = UploadJob & {
  originalFilename: string;
  settings: ParseSettings;
};

const JOBS_DIR = join(UPLOAD_TMP_DIR, "jobs");

function jobPath(jobId: string): string {
  return join(JOBS_DIR, `${jobId}.json`);
}

export async function ensureJobsDir(): Promise<void> {
  await mkdir(JOBS_DIR, { recursive: true });
}

export async function saveUploadJob(record: UploadJobRecord): Promise<void> {
  await ensureJobsDir();
  await writeFile(jobPath(record.jobId), JSON.stringify(record), "utf-8");
}

export async function loadUploadJob(jobId: string): Promise<UploadJobRecord | undefined> {
  try {
    const raw = await readFile(jobPath(jobId), "utf-8");
    return JSON.parse(raw) as UploadJobRecord;
  } catch {
    return undefined;
  }
}

export async function deleteUploadJob(jobId: string): Promise<void> {
  await unlink(jobPath(jobId)).catch(() => undefined);
}

export async function listUploadJobIds(): Promise<string[]> {
  await ensureJobsDir();
  const names = await readdir(JOBS_DIR);
  return names.filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, ""));
}

export function toPublicJob(record: UploadJobRecord): UploadJob {
  return {
    jobId: record.jobId,
    sessionId: record.sessionId,
    status: record.status,
    error: record.error,
    result: record.result,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    progress: record.progress,
    stage: record.stage,
  };
}

export function patchJob(
  record: UploadJobRecord,
  patch: Partial<
    Pick<UploadJobRecord, "status" | "error" | "result" | "progress" | "stage">
  >,
): UploadJobRecord {
  return { ...record, ...patch };
}
