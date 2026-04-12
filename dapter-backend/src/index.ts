import { randomUUID } from "node:crypto";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { AppError } from "./errors/app-error";
import { logger } from "./config/logger";
import { createDocumentController } from "./controllers/document.controller";
import { PocketBaseDocumentRepository } from "./repositories/pocketbase-document.repository";
import { AIService } from "./services/ai.service";
import { DocumentService } from "./services/document.service";
import { ExtractionService } from "./services/extraction.service";
import { StorageService } from "./services/storage.service";

const documentRepository = new PocketBaseDocumentRepository();
const storageService = new StorageService();
const extractionService = new ExtractionService();
const aiService = new AIService();
const documentService = new DocumentService(
  documentRepository,
  storageService,
  extractionService,
  aiService,
);

const app = new Elysia()
  .use(
    cors({
      origin: env.frontendBaseUrls,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  )
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Dapter API",
          version: "1.0.0",
        },
      },
    }),
  )
  .onRequest(({ request }) => {
    const requestId = randomUUID();
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    logger.info("http.request.received", {
      requestId,
      ip,
      method: request.method,
      path: new URL(request.url).pathname,
    });
  })
  .onAfterHandle(({ request, set }) => {
    logger.info("http.request.completed", {
      method: request.method,
      path: new URL(request.url).pathname,
      status: set.status,
    });
  })
  .get("/health", () => ({ status: "ok" }))
  .use(createDocumentController(documentService))
  .onError(({ code, error, set }) => {
    logger.error("http.request.failed", {
      code,
      status: set.status,
      error,
    });
    if (error instanceof AppError) {
      set.status = error.statusCode;
      return { message: error.message };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        error: {
          code: "ROUTE_NOT_FOUND",
          message: "Route not found",
          statusCode: 404,
        },
      };
    }
    set.status = 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
        statusCode: 500,
      },
    };
  });

app.listen(env.port);

logger.info("server.started", { port: env.port });
