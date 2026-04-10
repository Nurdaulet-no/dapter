import { Elysia, t } from "elysia";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { IDocumentService } from "../services/document.service";
import {
  documentStatusResponseSchema,
  uploadDocumentResponseSchema,
} from "../schemas/document.schema";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export const createDocumentController = (documentService: IDocumentService) =>
  new Elysia({ prefix: "/documents" })
    .post(
      "/upload",
      async ({ body, set }) => {
        try {
          logger.info("documents.upload.request.received");
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

          const bytes = new Uint8Array(await file.arrayBuffer());
          logger.debug("documents.upload.file.buffer.created", {
            byteLength: bytes.byteLength,
          });
          const result = await documentService.uploadAndQueue({
            fileName: file.name,
            mimeType: file.type,
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
      async ({ params, set }) => {
        try {
          logger.info("documents.status.request.received", {
            documentId: params.id,
          });
          const status = await documentService.getStatus(params.id);
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
          404: t.Object({ message: t.String() }),
          500: t.Object({ message: t.String() }),
        },
        detail: {
          tags: ["Documents"],
          summary: "Poll document processing status",
        },
      },
    );
