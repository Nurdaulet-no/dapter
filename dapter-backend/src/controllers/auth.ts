import PocketBase from "pocketbase";
import { env } from "../config/env";

export const resolveCurrentUserId = async (token: string): Promise<string | null> => {
  const client = new PocketBase(env.pocketbaseUrl);
  client.authStore.save(token);
  try {
    const authResult = await client.collection("users").authRefresh();
    return typeof authResult.record?.id === "string" ? authResult.record.id : null;
  } catch {
    return null;
  } finally {
    client.authStore.clear();
  }
};

const WINDOW_MS = 60 * 1000;
const MAX_UPLOADS_PER_MINUTE = 8;
const uploadRateBuckets = new Map<string, { count: number; resetAt: number }>();

export const checkUploadRateLimit = (key: string): boolean => {
  const now = Date.now();
  const current = uploadRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    uploadRateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_UPLOADS_PER_MINUTE) {
    return false;
  }
  current.count += 1;
  uploadRateBuckets.set(key, current);
  return true;
};

export const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
]);

export const normalizeMimeType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() ?? "";
