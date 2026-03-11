/* ── Google Cloud Storage helper ── */

import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import "dotenv/config";

const storage = new Storage();
const bucketName = process.env["GCS_BUCKET_NAME"] ?? "fixtrace-uploads-fixtrace-hackathon";
/**
 * Upload a file buffer to GCS and return its URI + metadata.
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ fileId: string; gcsUri: string; fileName: string }> {
  const fileId = uuidv4();
  const ext = path.extname(originalName);
  const destName = `uploads/${fileId}${ext}`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destName);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });

  const gcsUri = `gs://${bucketName}/${destName}`;
  return { fileId, gcsUri, fileName: originalName };
}

/**
 * Generate a signed URL so the front-end can display the file.
 */
export async function getSignedUrl(gcsUri: string): Promise<string> {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);

  const [, bucket, filePath] = match as [string, string, string];
  const [url] = await storage
    .bucket(bucket)
    .file(filePath)
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 15 * 60 * 1000 });

  return url;
}

/**
 * Delete a file from GCS.
 */
export async function deleteFile(gcsUri: string): Promise<void> {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);

  const [, bucket, filePath] = match as [string, string, string];
  await storage.bucket(bucket).file(filePath).delete();
}

/**
 * Download a file from GCS into a Buffer.
 */
export async function downloadFile(gcsUri: string): Promise<Buffer> {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);

  const [, bucket, filePath] = match as [string, string, string];
  const [contents] = await storage.bucket(bucket).file(filePath).download();
  return contents;
}
