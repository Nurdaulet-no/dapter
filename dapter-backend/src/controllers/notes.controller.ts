import { Elysia, t } from "elysia";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import {
  createNotesResponseSchema,
  notesDetailResponseSchema,
  notesListResponseSchema,
  notesStatusResponseSchema,
} from "../schemas/notes.schema";
import type { INotesService } from "../services/notes.service";
import {
  allowedMimeTypes,
  checkUploadRateLimit,
  normalizeMimeType,
  resolveCurrentUserId,
} from "./auth";

const errorBody = t.Object({ message: t.String() });

const collectFiles = (raw: unknown): File[] => {
  if (Array.isArray(raw)) return raw.filter((item): item is File => item instanceof File);
  if (raw instanceof File) return [raw];
  return [];
};

export const createNotesController = (notesService: INotesService) =>
  new Elysia({ prefix: "/notes" })
    .derive(async ({ request }) => {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;
      if (!bearerToken) return { currentUser: null };
      const userId = await resolveCurrentUserId(bearerToken);
      return userId ? { currentUser: { id: userId } } : { currentUser: null };
    })
    .get(
      "/",
      async ({ currentUser, set }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        try {
          return await notesService.list(currentUser.id);
        } catch (error) {
          set.status = 500;
          return {
            message: error instanceof Error ? error.message : "Unexpected list error",
          };
        }
      },
      {
        response: {
          200: notesListResponseSchema,
          401: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "List the current user's notes rows" },
      },
    )
    .post(
      "/",
      async ({ body, set, request, currentUser }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        const rateKey = currentUser.id || request.headers.get("x-forwarded-for") || "unknown";
        if (!checkUploadRateLimit(rateKey)) {
          set.status = 429;
          return { message: "Too many uploads. Please retry later." };
        }
        const files = collectFiles(body.files);
        if (files.length === 0) {
          set.status = 400;
          return { message: "At least one file is required" };
        }
        if (files.length > 5) {
          set.status = 400;
          return { message: "Maximum 5 files per upload" };
        }
        const prepared: Array<{ fileName: string; mimeType: string; bytes: Uint8Array }> = [];
        for (const file of files) {
          const mimeType = normalizeMimeType(file.type);
          if (!allowedMimeTypes.has(mimeType)) {
            set.status = 400;
            return { message: "Unsupported file type. Allowed: PDF, PPTX, TXT, MD" };
          }
          if (file.size > env.maxUploadSizeBytes) {
            set.status = 400;
            return { message: `File "${file.name}" exceeds max size ${env.maxUploadSizeBytes}` };
          }
          prepared.push({
            fileName: file.name,
            mimeType,
            bytes: new Uint8Array(await file.arrayBuffer()),
          });
        }
        try {
          const result = await notesService.createAndQueue({
            ownerId: currentUser.id,
            files: prepared,
          });
          logger.info("notes.upload.queued", { id: result.id });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected upload error";
          logger.error("notes.upload.failed", {
            message,
            pbResponse: (error as { response?: unknown })?.response,
            error,
          });
          set.status = 500;
          return { message };
        }
      },
      {
        body: t.Object({
          files: t.Union([t.Files(), t.File()]),
        }),
        response: {
          200: createNotesResponseSchema,
          400: errorBody,
          401: errorBody,
          429: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "Upload files and start notes generation" },
      },
    )
    .get(
      "/:id",
      async ({ params, set, currentUser }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        try {
          return await notesService.getDetail(params.id, currentUser.id);
        } catch (error) {
          if (error instanceof AppError) {
            set.status = error.statusCode;
            return { message: error.message };
          }
          set.status = 500;
          return {
            message: error instanceof Error ? error.message : "Unexpected fetch error",
          };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        response: {
          200: notesDetailResponseSchema,
          401: errorBody,
          403: errorBody,
          404: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "Get a notes row with its markdown" },
      },
    )
    .get(
      "/:id/status",
      async ({ params, set, currentUser }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        try {
          return await notesService.getStatus(params.id, currentUser.id);
        } catch (error) {
          if (error instanceof AppError) {
            set.status = error.statusCode;
            return { message: error.message };
          }
          set.status = 500;
          return {
            message: error instanceof Error ? error.message : "Unexpected status error",
          };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        response: {
          200: notesStatusResponseSchema,
          401: errorBody,
          403: errorBody,
          404: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "Poll notes row status" },
      },
    )
    .post(
      "/:id/retry",
      async ({ params, set, currentUser }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        try {
          return await notesService.retry(params.id, currentUser.id);
        } catch (error) {
          if (error instanceof AppError) {
            set.status = error.statusCode;
            return { message: error.message };
          }
          set.status = 500;
          return {
            message: error instanceof Error ? error.message : "Unexpected retry error",
          };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        response: {
          200: createNotesResponseSchema,
          401: errorBody,
          403: errorBody,
          404: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "Retry notes generation" },
      },
    )
    .delete(
      "/:id",
      async ({ params, set, currentUser }) => {
        if (!currentUser) {
          set.status = 401;
          return { message: "Unauthorized" };
        }
        try {
          await notesService.delete(params.id, currentUser.id);
          return { success: true };
        } catch (error) {
          if (error instanceof AppError) {
            set.status = error.statusCode;
            return { message: error.message };
          }
          set.status = 500;
          return {
            message: error instanceof Error ? error.message : "Unexpected delete error",
          };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        response: {
          200: t.Object({ success: t.Boolean() }),
          401: errorBody,
          403: errorBody,
          404: errorBody,
          500: errorBody,
        },
        detail: { tags: ["Notes"], summary: "Delete a notes row" },
      },
    );
