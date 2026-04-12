import { Elysia, t } from "elysia";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IAuthService } from "../services/auth.service";
import type { IDocumentService } from "../services/document.service";
import {
  documentListResponseSchema,
  documentFlashcardsResponseSchema,
  documentNotesResponseSchema,
  documentQuizzesResponseSchema,
  documentStatusResponseSchema,
  flashcardImageRequestResponseSchema,
  uploadDocumentResponseSchema,
} from "../schemas/document.schema";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const WINDOW_MS = 60 * 1000;
const MAX_UPLOADS_PER_MINUTE = 8;
const uploadRateBuckets = new Map<string, { count: number; resetAt: number }>();
const ACCESS_COOKIE = "dapter_access_token";

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

const readCookie = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
};

export const createDocumentController = (
  documentService: IDocumentService,
  authService: IAuthService,
) =>
  new Elysia({ prefix: "/documents" })
    .derive(async ({ request }) => {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;
      const cookieToken = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
      const token = bearerToken ?? cookieToken;
      if (!token) {
        return { currentUser: null };
      }
      try {
        const user = await authService.verifyAccessToken(token);
        return { currentUser: user };
      } catch {
        return { currentUser: null };
      }
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
      "/:id/flashcards/:flashcardId/image/request",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          return await documentService.requestFlashcardImage(
            params.id,
            params.flashcardId,
            currentUser.id,
          );
        } catch (e) {
          if (e instanceof AppError) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected image request error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
          flashcardId: t.String(),
        }),
        response: {
          200: flashcardImageRequestResponseSchema,
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          409: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Request lazy image generation for one flashcard",
        },
      },
    )
    .get(
      "/trash",
      async ({ currentUser, set }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          return await documentService.getTrashDocuments(currentUser.id);
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
          summary: "List current user's trashed documents",
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
          logger.debug("documents.upload.file.metadata", {
            name: file.name,
            mimeType: file.type,
            size: file.size,
          });
          if (!allowedMimeTypes.has(file.type)) {
            set.status = 400;
            logger.error("documents.upload.validation.failed", {
              reason: "unsupported_mime_type",
              mimeType: file.type,
            });
            return { message: "Unsupported file type. Allowed: PDF, PPTX" };
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

          const selectedPages =
            typeof body.selectedPages === "string" && body.selectedPages.trim().length > 0
              ? [...new Set(
                  body.selectedPages
                    .split(",")
                    .map((item) => Number(item.trim()))
                    .filter((value) => Number.isInteger(value) && value >= 1),
                )].sort((a, b) => a - b)
              : undefined;
          if (selectedPages && selectedPages.length > env.maxSelectedPages) {
            set.status = 400;
            return { message: `Selected pages exceed MAX_SELECTED_PAGES=${env.maxSelectedPages}` };
          }

          if (
            body.selectedStartPage !== undefined &&
            body.selectedEndPage !== undefined &&
            Number(body.selectedStartPage) > Number(body.selectedEndPage)
          ) {
            set.status = 400;
            return { message: "Invalid selected page range" };
          }
          if (body.selectedStartPage !== undefined && Number(body.selectedStartPage) < 1) {
            set.status = 400;
            return { message: "selectedStartPage must be >= 1" };
          }
          if (body.selectedEndPage !== undefined && Number(body.selectedEndPage) < 1) {
            set.status = 400;
            return { message: "selectedEndPage must be >= 1" };
          }
          if (
            !selectedPages &&
            body.selectedStartPage !== undefined &&
            body.selectedEndPage !== undefined &&
            Number(body.selectedEndPage) - Number(body.selectedStartPage) + 1 > env.maxSelectedPages
          ) {
            set.status = 400;
            return { message: `Selected range exceeds MAX_SELECTED_PAGES=${env.maxSelectedPages}` };
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          logger.debug("documents.upload.file.buffer.created", {
            byteLength: bytes.byteLength,
          });
          const result = await documentService.uploadAndQueue({
            userId: currentUser.id,
            fileName: file.name,
            mimeType: file.type,
            bytes,
            selectedStartPage: body.selectedStartPage,
            selectedEndPage: body.selectedEndPage,
            selectedPages,
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
          selectedStartPage: t.Optional(t.Numeric()),
          selectedEndPage: t.Optional(t.Numeric()),
          selectedPages: t.Optional(t.String()),
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
      "/:id",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          await documentService.deleteDocument(params.id, currentUser.id);
          return { success: true };
        } catch (e) {
          if (
            e instanceof AppError &&
            (e.statusCode === 403 || e.statusCode === 404 || e.statusCode === 409)
          ) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected delete error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: t.Object({ success: t.Boolean() }),
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          409: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Move current user's document to trash",
        },
      },
    )
    .post(
      "/:id/restore",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          await documentService.restoreDocument(params.id, currentUser.id);
          return { success: true };
        } catch (e) {
          if (
            e instanceof AppError &&
            (e.statusCode === 403 || e.statusCode === 404 || e.statusCode === 409)
          ) {
            set.status = e.statusCode;
            return { message: e.message };
          }
          const message = e instanceof Error ? e.message : "Unexpected restore error";
          set.status = 500;
          return { message };
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        response: {
          200: t.Object({ success: t.Boolean() }),
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          409: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Restore a trashed document",
        },
      },
    )
    .delete(
      "/:id/forever",
      async ({ params, set, currentUser }) => {
        try {
          if (!currentUser) {
            set.status = 401;
            return { message: "Unauthorized" };
          }
          await documentService.deleteDocumentForever(params.id, currentUser.id);
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
        response: {
          200: t.Object({ success: t.Boolean() }),
          401: t.Object({ message: t.String() }),
          403: t.Object({ message: t.String() }),
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Delete document forever with storage cleanup",
        },
      },
    );
