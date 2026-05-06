/**
 * Blob client for Azure Blob Storage. D3 + N10.
 *
 * `raw-events` container holds the immutable audit-event archive — one
 * Blob per polling batch, named by tenant + observation timestamp. The
 * primary index of "what events did we ever see" lives in Postgres
 * (`raw_events` table); Blob is the source of truth for the underlying
 * JSON.
 *
 * Auth resolution, in order:
 *   1. STORAGE_CONNECTION_STRING (account-key auth) — simplest for dev
 *   2. STORAGE_ACCOUNT_NAME + DefaultAzureCredential (managed identity in
 *      cluster, az-login locally) — production path
 *
 * Caller is responsible for granting "Storage Blob Data Contributor" to:
 *   - the developer's Azure AD identity (for local smoke tests)
 *   - each Container App's managed identity (for deployed workers)
 *
 * Blob path convention:
 *   raw-events/{tenant_id}/{YYYY/MM/DD}/{archive_id}.json
 */

import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";

const RAW_EVENTS_CONTAINER = "raw-events";
const BASELINES_CONTAINER = "baselines";

let cachedService: BlobServiceClient | null = null;

/**
 * Process-wide BlobServiceClient. Memoized.
 *
 * Connection-string path used iff STORAGE_CONNECTION_STRING is set;
 * otherwise STORAGE_ACCOUNT_NAME with DefaultAzureCredential.
 */
export function getBlobService(): BlobServiceClient {
  if (cachedService) return cachedService;
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (conn) {
    cachedService = BlobServiceClient.fromConnectionString(conn);
    return cachedService;
  }
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error(
      "Blob: neither STORAGE_CONNECTION_STRING nor STORAGE_ACCOUNT_NAME is set",
    );
  }
  cachedService = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  return cachedService;
}

export function getRawEventsContainer(): ContainerClient {
  return getBlobService().getContainerClient(RAW_EVENTS_CONTAINER);
}

export function getBaselinesContainer(): ContainerClient {
  return getBlobService().getContainerClient(BASELINES_CONTAINER);
}

export interface ArchiveRawEventsArgs {
  tenantId: string;
  /** ISO observation time used to date-partition the path. */
  observedAt: string;
  /** Stable archive ID (e.g., a UUID or sha256 of contents). */
  archiveId: string;
  /** Full Microsoft audit-event objects, verbatim. */
  events: readonly unknown[];
}

export interface ArchiveRawEventsResult {
  blobUrl: string;
  count: number;
  byteLength: number;
}

/**
 * Upload a polling batch as a single JSON Blob. Returns the canonical
 * blob URL used by the `raw_events` row's `blob_url` field.
 */
export async function archiveRawEvents(
  args: ArchiveRawEventsArgs,
): Promise<ArchiveRawEventsResult> {
  const date = args.observedAt.slice(0, 10).replace(/-/g, "/");
  const blobPath = `${args.tenantId}/${date}/${args.archiveId}.json`;
  const blob = getRawEventsContainer().getBlockBlobClient(blobPath);
  const json = JSON.stringify(args.events);
  const buf = Buffer.from(json, "utf8");
  await blob.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: "application/json",
      blobCacheControl: "private, max-age=86400",
    },
    metadata: {
      tenantid: args.tenantId,
      archiveid: args.archiveId,
      observedat: args.observedAt,
      eventcount: String(args.events.length),
    },
  });
  return {
    blobUrl: blob.url,
    count: args.events.length,
    byteLength: buf.byteLength,
  };
}

/** Hint exported for archive ID derivation outside this module. */
export { StorageSharedKeyCredential };
