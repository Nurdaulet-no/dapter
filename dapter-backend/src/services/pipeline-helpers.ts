import { env } from "../config/env";
import { logger } from "../config/logger";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";

export function buildProvisionalTitle(fileNames: string[]): string {
  if (fileNames.length === 0) return "Generating…";
  const [first, ...rest] = fileNames;
  if (rest.length === 0) return `Generating: ${first}`;
  return `Generating: ${first} (+${rest.length} more)`;
}

export interface DownloadedSource {
  fileKey: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export async function extractCombinedText(input: {
  storageService: IStorageService;
  extractionService: IExtractionService;
  sources: Array<{ fileKey: string; fileName: string; mimeType: string }>;
}): Promise<string> {
  const parts: string[] = [];
  for (const source of input.sources) {
    const bytes = await input.storageService.download(source.fileKey);
    logger.debug("pipeline.source.downloaded", {
      fileKey: source.fileKey,
      fileName: source.fileName,
      byteLength: bytes.byteLength,
    });
    const rawText = await input.extractionService.extractText({
      mimeType: source.mimeType,
      bytes,
    });
    const trimmed = rawText.length > env.maxExtractedChars
      ? rawText.slice(0, env.maxExtractedChars)
      : rawText;
    parts.push(`--- file: ${source.fileName} ---\n${trimmed}`);
  }
  const combined = parts.join("\n\n");
  return combined.length > env.maxExtractedChars
    ? combined.slice(0, env.maxExtractedChars)
    : combined;
}

export async function runWithStageTimeout<T>(
  stage: "flashcards" | "quizzes",
  rowId: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logger.info("pipeline.stage.started", {
    rowId,
    stage,
    timeoutMs: env.aiStageTimeoutMs,
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Stage "${stage}" timed out after ${env.aiStageTimeoutMs}ms`));
    }, env.aiStageTimeoutMs);
  });
  const result = (await Promise.race([action(), timeoutPromise])) as T;
  logger.info("pipeline.stage.finished", {
    rowId,
    stage,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

export const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
]);

export const normalizeMimeType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() ?? "";
