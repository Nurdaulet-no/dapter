import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { createDocumentController } from "./controllers/document.controller";
import { DocumentRepository } from "./repositories/document.repository";
import { AIService } from "./services/ai.service";
import { DocumentService } from "./services/document.service";
import { ExtractionService } from "./services/extraction.service";
import { StorageService } from "./services/storage.service";

const documentRepository = new DocumentRepository(prisma);
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
      origin: true,
      methods: ["GET", "POST", "OPTIONS"],
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
    logger.info("http.request.received", {
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
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Route not found" };
    }
    set.status = 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return { message };
  });

app.listen(env.port);

logger.info("server.started", { port: env.port });
