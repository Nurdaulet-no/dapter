import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IDocumentRepository } from "../repositories/document.repository";
import type { PocketBaseDocumentType } from "../types/pocketbase";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";
import { createLLMProvider } from "./providers/factory";

export interface IDocumentService {
  uploadAndQueue(input: {
    userId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ documentId: string; status: "PROCESSING" }>;
  processDocument(documentId: string): Promise<void>;
  getStatus(documentId: string, userId: string): Promise<Awaited<ReturnType<IDocumentRepository["getDocumentStatus"]>>>;
  getFlashcards(
    documentId: string,
    userId: string,
  ): Promise<Awaited<ReturnType<IDocumentRepository["getDocumentFlashcards"]>>>;
  getQuizzes(
    documentId: string,
    userId: string,
  ): Promise<Awaited<ReturnType<IDocumentRepository["getDocumentQuizzes"]>>>;
  getNotes(documentId: string, userId: string): Promise<Awaited<ReturnType<IDocumentRepository["getDocumentNotes"]>>>;
  getDocuments(userId: string): ReturnType<IDocumentRepository["getDocumentsByUserId"]>;
  deleteArtifactsForever(
    documentId: string,
    userId: string,
    target: "notes" | "flashcards" | "quizzes",
  ): Promise<void>;
  retryStage(
    documentId: string,
    stage: "notebook" | "flashcards" | "quizzes",
    userId: string,
  ): Promise<{ documentId: string; status: "PROCESSING" }>;
}

export class DocumentService implements IDocumentService {
  private readonly llmProvider = createLLMProvider();

  public constructor(
    private readonly repository: IDocumentRepository,
    private readonly storageService: IStorageService,
    private readonly extractionService: IExtractionService,
    private readonly aiService: IAIService,
  ) {}

  public async uploadAndQueue(input: {
    userId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ documentId: string; status: "PROCESSING" }> {
    logger.info("pipeline.upload_and_queue.started", {
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
    });
    const type = this.mapMimeTypeToDocumentType(input.mimeType);

    const uploaded = await this.storageService.upload({
      fileName: input.fileName,
      mimeType: input.mimeType,
      body: input.bytes,
    });
    logger.info("pipeline.storage.upload.completed", {
      fileKey: uploaded.fileKey,
      fileUrl: uploaded.fileUrl,
    });

    const created = await this.repository.createDocument({
      userId: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
      fileKey: uploaded.fileKey,
      fileUrl: uploaded.fileUrl,
      type,
    });
    logger.info("pipeline.registration.completed", {
      documentId: created.id,
      status: "PROCESSING",
    });

    void this.processDocument(created.id);
    logger.info("pipeline.background_processing.triggered", {
      documentId: created.id,
    });
    return { documentId: created.id, status: "PROCESSING" };
  }

  public async processDocument(documentId: string): Promise<void> {
    logger.info("pipeline.process_document.started", { documentId });
    const document = await this.repository.getById(documentId);
    if (!document) {
      logger.error("pipeline.process_document.document_not_found", { documentId });
      throw new Error("Document not found");
    }

    try {
      await this.generateNotebookStage(documentId, document.fileKey, document.mimeType);
      await this.generateFlashcardsStage(documentId);
      await this.generateQuizzesStage(documentId);
      logger.info("pipeline.process_document.completed", { documentId, status: "COMPLETED" });
    } catch {
      // stage-level handlers already persist explicit errors/statuses
    }
  }

  public async getStatus(documentId: string, userId: string) {
    logger.debug("pipeline.status_lookup.started", { documentId });
    await this.ensureOwnershipOrNotFound(documentId, userId);
    return this.repository.getDocumentStatus(documentId, userId);
  }

  public async getFlashcards(documentId: string, userId: string) {
    logger.debug("pipeline.flashcards_lookup.started", { documentId });
    await this.ensureOwnershipOrNotFound(documentId, userId);
    return this.repository.getDocumentFlashcards(documentId, userId);
  }

  public async getQuizzes(documentId: string, userId: string) {
    logger.debug("pipeline.quizzes_lookup.started", { documentId });
    await this.ensureOwnershipOrNotFound(documentId, userId);
    return this.repository.getDocumentQuizzes(documentId, userId);
  }

  public async getNotes(documentId: string, userId: string) {
    logger.debug("pipeline.notes_lookup.started", { documentId });
    await this.ensureOwnershipOrNotFound(documentId, userId);
    return this.repository.getDocumentNotes(documentId, userId);
  }

  public getDocuments(userId: string) {
    return this.repository.getDocumentsByUserId(userId);
  }

  public async deleteArtifactsForever(
    documentId: string,
    userId: string,
    target: "notes" | "flashcards" | "quizzes",
  ): Promise<void> {
    await this.ensureOwnershipOrNotFound(documentId, userId);
    if (target === "notes") {
      await this.repository.deleteNotesArtifacts(documentId);
      return;
    }
    if (target === "flashcards") {
      await this.repository.deleteFlashcardsArtifacts(documentId);
      return;
    }
    await this.repository.deleteQuizzesArtifacts(documentId);
  }

  public async retryStage(
    documentId: string,
    stage: "notebook" | "flashcards" | "quizzes",
    userId: string,
  ): Promise<{ documentId: string; status: "PROCESSING" }> {
    await this.ensureOwnershipOrNotFound(documentId, userId);
    const document = await this.repository.getById(documentId, userId);
    if (!document) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
    }

    void (async () => {
      try {
        if (stage === "notebook") {
          await this.generateNotebookStage(documentId, document.fileKey, document.mimeType);
          await this.generateFlashcardsStage(documentId);
          await this.generateQuizzesStage(documentId);
          return;
        }
        if (stage === "flashcards") {
          if (document.notebookStatus !== "COMPLETED") {
            throw new Error("Cannot retry flashcards before notebook is completed");
          }
          await this.generateFlashcardsStage(documentId);
          return;
        }
        if (document.notebookStatus !== "COMPLETED") {
          throw new Error("Cannot retry quizzes before notebook is completed");
        }
        await this.generateQuizzesStage(documentId);
      } catch (error) {
        logger.error("pipeline.stage.retry.failed", {
          documentId,
          stage,
          message: error instanceof Error ? error.message : "Unexpected retry error",
          error,
        });
      }
    })();

    return { documentId, status: "PROCESSING" };
  }

  private async ensureOwnershipOrNotFound(documentId: string, userId: string): Promise<void> {
    const owned = await this.repository.getById(documentId, userId);
    if (owned) {
      return;
    }
    const exists = await this.repository.getById(documentId);
    if (exists) {
      throw new AppError(403, "DOCUMENT_FORBIDDEN", "Forbidden");
    }
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }

  private mapMimeTypeToDocumentType(mimeType: string): PocketBaseDocumentType {
    if (mimeType === "application/pdf") {
      return "PDF";
    }
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      return "PPTX";
    }
    if (mimeType === "text/plain") {
      return "TXT";
    }
    if (mimeType === "text/markdown") {
      return "MD";
    }
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }

  private async runWithTimeout<T>(
    stage: "notebook" | "flashcards" | "quizzes",
    action: () => Promise<T>,
    documentId: string,
  ): Promise<T> {
    const startedAt = Date.now();
    logger.info("pipeline.stage.started", { documentId, stage, timeoutMs: env.aiStageTimeoutMs });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Stage "${stage}" timed out after ${env.aiStageTimeoutMs}ms`));
      }, env.aiStageTimeoutMs);
    });

    const result = await Promise.race([action(), timeoutPromise]) as T;
    logger.info("pipeline.stage.finished", {
      documentId,
      stage,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  private async getNotebookTextFromDb(documentId: string): Promise<string> {
    const notes = await this.repository.getNotesForProcessing(documentId);
    if (notes.length === 0) {
      throw new Error("Notebook is empty and cannot be used for downstream generation");
    }
    return notes.map((item) => `${item.title}\n${item.content}`).join("\n\n").trim();
  }

  private async generateNotebookStage(
    documentId: string,
    fileKey: string,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.repository.markStageProcessing(documentId, "notebook");
      const bytes = await this.storageService.download(fileKey);
      logger.debug("pipeline.process_document.storage_download.completed", {
        documentId,
        fileKey,
        byteLength: bytes.byteLength,
      });
      const rawText = await this.extractionService.extractText({ mimeType, bytes });
      const wasTruncated = rawText.length > env.maxExtractedChars;
      const text = wasTruncated ? rawText.slice(0, env.maxExtractedChars) : rawText;
      if (wasTruncated) {
        logger.info("pipeline.process_document.extraction.truncated", {
          documentId,
          originalLength: rawText.length,
          truncatedLength: text.length,
          maxExtractedChars: env.maxExtractedChars,
        });
      }
      logger.debug("pipeline.process_document.extraction.completed", {
        documentId,
        textLength: text.length,
      });
      const notebook = await this.runWithTimeout("notebook", () => this.aiService.generateNotebook(text), documentId);
      await this.repository.saveNotebookArtifacts(documentId, notebook.notes);
      logger.info("pipeline.stage.completed", {
        documentId,
        stage: "notebook",
        notes: notebook.notes.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notebook stage failed";
      logger.error("pipeline.stage.failed", {
        documentId,
        stage: "notebook",
        message,
        pbResponse: (error as { response?: unknown })?.response,
        error,
      });
      await this.repository.markStageFailed(documentId, "notebook", message);
      throw error;
    }
  }

  private async generateFlashcardsStage(documentId: string): Promise<void> {
    try {
      await this.repository.markStageProcessing(documentId, "flashcards");
      const notebookText = await this.getNotebookTextFromDb(documentId);
      const flashcardDecks = await this.runWithTimeout(
        "flashcards",
        () => this.aiService.generateFlashcardDecksFromNotebook(notebookText),
        documentId,
      );
      await this.repository.saveFlashcardDecksArtifacts(documentId, flashcardDecks.flashcardDecks);
      await this.generateFlashcardImagesStage(documentId);
      await this.repository.markFlashcardsGenerationCompleted(documentId);
      logger.info("pipeline.stage.completed", {
        documentId,
        stage: "flashcards",
        flashcardDecks: flashcardDecks.flashcardDecks.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Flashcards stage failed";
      logger.error("pipeline.stage.failed", {
        documentId,
        stage: "flashcards",
        message,
        pbResponse: (error as { response?: unknown })?.response,
        error,
      });
      await this.repository.markStageFailed(documentId, "flashcards", message);
      throw error;
    }
  }

  private async generateFlashcardImagesStage(documentId: string): Promise<void> {
    const cards = await this.repository.getFlashcardsForImageGeneration(documentId);
    await Promise.all(
      cards.map(async (card) => {
        const imageUrls = await this.llmProvider.generateImageUrls({ prompt: card.imagePrompt });
        await this.repository.updateFlashcardImageUrls(documentId, card.id, imageUrls);
      }),
    );
  }

  private async generateQuizzesStage(documentId: string): Promise<void> {
    try {
      await this.repository.markStageProcessing(documentId, "quizzes");
      const notebookText = await this.getNotebookTextFromDb(documentId);
      const quizzes = await this.runWithTimeout(
        "quizzes",
        () => this.aiService.generateQuizzesFromNotebook(notebookText),
        documentId,
      );
      await this.repository.saveQuizzesArtifacts(documentId, quizzes.quizzes);
      logger.info("pipeline.stage.completed", {
        documentId,
        stage: "quizzes",
        quizzes: quizzes.quizzes.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quizzes stage failed";
      logger.error("pipeline.stage.failed", {
        documentId,
        stage: "quizzes",
        message,
        pbResponse: (error as { response?: unknown })?.response,
        error,
      });
      await this.repository.markStageFailed(documentId, "quizzes", message);
      throw error;
    }
  }
}
