import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_BUCKET = "report-images";
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * Detects the real image type from magic bytes (the browser-supplied MIME type
 * and file name are not trusted).
 */
export function sniffImageType(buf: Uint8Array): ImageMediaType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

export class ImageValidationError extends Error {}

export function validateImage(buf: Uint8Array): ImageMediaType {
  if (buf.byteLength === 0) throw new ImageValidationError("The photo is empty.");
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new ImageValidationError("The photo is larger than 5 MB.");
  const type = sniffImageType(buf);
  if (!type) throw new ImageValidationError("Only JPEG, PNG, WebP or GIF photos are accepted.");
  return type;
}

const EXT: Record<ImageMediaType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** Uploads to the private bucket under a random, non-guessable path. */
export async function storeReportImage(reportId: string, buf: Uint8Array, type: ImageMediaType): Promise<string> {
  const path = `${reportId}/${crypto.randomUUID()}.${EXT[type]}`;
  const { error } = await adminClient().storage.from(IMAGE_BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (error) throw new Error(`image upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URL for staff viewing. Never exposes the bucket publicly. */
export async function signedImageUrl(path: string, expiresIn = 300): Promise<string | null> {
  const { data, error } = await adminClient().storage.from(IMAGE_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

