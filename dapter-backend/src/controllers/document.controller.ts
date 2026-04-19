import { Elysia, t } from "elysia";
import PocketBase from "pocketbase";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IDocumentService } from "../services/document.service";
import {
  documentListResponseSchema,
  documentFlashcardsResponseSchema,
  documentNotesResponseSchema,
  documentQuizzesResponseSchema,
  documentStatusResponseSchema,
  uploadDocumentResponseSchema,
} from "../schemas/document.schema";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
]);

const normalizeMimeType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() ?? "";

const WINDOW_MS = 60 * 1000;
const MAX_UPLOADS_PER_MINUTE = 8;
const uploadRateBuckets = new Map<string, { count: number; resetAt: number }>();

const checkUploadRateLimit = (key: string): boolean => {
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

const resolveCurrentUserId = async (token: string): Promise<string | null> => {
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

export const createDocumentController = (documentService: IDocumentService) =>
  new Elysia({ prefix: "/documents" })
    .derive(async ({ request }) => {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;
      const token = bearerToken;
      if (!token) {
        return { currentUser: null };
      }
      const userId = await resolveCurrentUserId(token);
      if (!userId) {
        return { currentUser: null };
      }
      return { currentUser: { id: userId } };
    })
    .get(
      "/",
      async ({ currentUser, set }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          return await documentService.getDocuments(currentUser.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected list error";
          set.status = 500;
          return { message };
        }
      },
      {
        response: {
          200: documentListResponseSchema,
          401: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "List current user's documents",
        },
      },
    )
    .post(
      "/:id/retry/:stage",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          if (params.stage !== "notebook" && params.stage !== "flashcards" && params.stage !== "quizzes") {
            set.status = 400;
            return { message: "Invalid stage. Allowed: notebook, flashcards, quizzes" };
          }
          return await documentService.retryStage(params.id, params.stage, currentUser.id);
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected retry error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
          stage: t.String(),
        }),
        response: {
          200: uploadDocumentResponseSchema,
          400: t.Object({ message: t.String() }),
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Retry one processing stage",
        },
      },
    )
    .post(
      "/upload",
      async ({ body, set, request, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          logger.info("documents.upload.request.received");
          const rateKey = currentUser.id || request.headers.get("x-forwarded-for") || "unknown";
          if (!checkUploadRateLimit(rateKey)) {
            set.status = 429;
            return { message: "Too many uploads. Please retry later." };
          }
          const file = body.file;
          if (!file) {
            set.status = 400;
            logger.error("documents.upload.validation.failed", {
              reason: "file_missing",
            });
            return { message: "File is required" };
          }
          const mimeType = normalizeMimeType(file.type);
          logger.debug("documents.upload.file.metadata", {
            name: file.name,
            mimeType,
            rawMimeType: file.type,
            size: file.size,
          });
          if (!allowedMimeTypes.has(mimeType)) {
            set.status = 400;
            logger.error("documents.upload.validation.failed", {
              reason: "unsupported_mime_type",
              mimeType,
              rawMimeType: file.type,
            });
            return { message: "Unsupported file type. Allowed: PDF, PPTX, TXT, MD" };
          }
          if (file.size > env.maxUploadSizeBytes) {
            set.status = 400;
            logger.error("documents.upload.validation.failed", {
              reason: "file_too_large",
              size: file.size,
              maxUploadSizeBytes: env.maxUploadSizeBytes,
            });
            return { message: `File is too large. Max size: ${env.maxUploadSizeBytes}` };
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          logger.debug("documents.upload.file.buffer.created", {
            byteLength: bytes.byteLength,
          });
          const result = await documentService.uploadAndQueue({
            userId: currentUser.id,
            fileName: file.name,
            mimeType,
            bytes,
          });
          logger.info("documents.upload.request.queued", {
            documentId: result.documentId,
            status: result.status,
          });
          return result;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unexpected upload error";
          set.status = 500;
          logger.error("documents.upload.request.failed", {
            message,
            error: e,
          });
          return { message };
        }
      },
      {
        body: t.Object({
          file: t.File(),
        }),
        response: {
          200: uploadDocumentResponseSchema,
          400: t.Object({ message: t.String() }),
          401: t.Object({ message: t.String() }),
          429: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Upload document and start async processing",
        },
      },
    )
    .get(
      "/:id/status",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          logger.info("documents.status.request.received", {
            documentId: params.id,
          });
          const status = await documentService.getStatus(params.id, currentUser.id);
          if (!status) {
            set.status = 404;
            logger.error("documents.status.not_found", {
              documentId: params.id,
            });
            return { message: "Document not found" };
          }
          logger.info("documents.status.request.completed", {
            documentId: params.id,
            status: status.status,
          });
          return status;
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected status check error";
          set.status = 500;
          logger.error("documents.status.request.failed", {
            documentId: params.id,
            message,
            error: e,
          });
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: documentStatusResponseSchema,
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Poll document processing status",
        },
      },
    )
    .get(
      "/:id/flashcards",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const payload = await documentService.getFlashcards(params.id, currentUser.id);
          if (!payload) {
            set.status = 404;
            return { message: "Document not found" };
          }
          return payload;
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected flashcards fetch error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: documentFlashcardsResponseSchema,
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Get flashcards by document id",
        },
      },
    )
    .get(
      "/:id/quizzes",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const payload = await documentService.getQuizzes(params.id, currentUser.id);
          if (!payload) {
            set.status = 404;
            return { message: "Document not found" };
          }
          return payload;
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected quizzes fetch error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: documentQuizzesResponseSchema,
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Get quizzes by document id",
        },
      },
    )
    .get(
      "/:id/notes",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const payload = await documentService.getNotes(params.id, currentUser.id);
          if (!payload) {
            set.status = 404;
            return { message: "Document not found" };
          }
          return payload;
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected notes fetch error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: documentNotesResponseSchema,
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Get notes by document id",
        },
      },
    )
    .delete(
      "/:id/forever",
      async ({ params, query, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          const target = query.target;
          if (target !== "notes" && target !== "flashcards" && target !== "quizzes") {
            set.status = 400;
            return { message: "Invalid target. Allowed: notes, flashcards, quizzes" };
          }
          await documentService.deleteArtifactsForever(params.id, currentUser.id, target);
          return { success: true };
        } catch (e) {
          if (e instanceof AppError && (e.statusCode === 403 || e.statusCode === 404)) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected delete forever error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        query: t.Object({
          target: t.Union([t.Literal("notes"), t.Literal("flashcards"), t.Literal("quizzes")]),
        }),
        response: {
          200: t.Object({ success: t.Boolean() }),
          400: t.Object({ message: t.String() }),
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Delete one artifacts group forever: notes|flashcards|quizzes",
        },
      },
    );
