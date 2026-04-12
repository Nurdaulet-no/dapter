import type { DocumentType } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IDocumentRepository } from "../repositories/document.repository";
import type { FlashcardImageRequestResult } from "../types/document";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";

export interface IDocumentService {
  uploadAndQueue(input: {
    userId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    selectedStartPage?: number;
    selectedEndPage?: number;
    selectedPages?: number[];
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
  getTrashDocuments(userId: string): ReturnType<IDocumentRepository["getDocumentsByUserId"]>;
  restoreDocument(documentId: string, userId: string): Promise<void>;
  deleteDocument(documentId: string, userId: string): Promise<void>;
  deleteDocumentForever(documentId: string, userId: string): Promise<void>;
  requestFlashcardImage(documentId: string, flashcardId: string, userId: string): Promise<FlashcardImageRequestResult>;
  retryStage(
    documentId: string,
    stage: "notebook" | "flashcards" | "quizzes",
    userId: string,
  ): Promise<{ documentId: string; status: "PROCESSING" }>;
  processQueuedFlashcardImages(batchSize: number): Promise<{ scanned: number; queued: number; failed: number }>;
  cleanupExpiredTrash(retentionDays: number, batchSize: number): Promise<{
    scanned: number;
    deleted: number;
    failed: number;
  }>;
}

export class DocumentService implements IDocumentService {
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
    selectedStartPage?: number;
    selectedEndPage?: number;
    selectedPages?: number[];
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
      selectedStartPage: input.selectedStartPage,
      selectedEndPage: input.selectedEndPage,
      type,
    });
    logger.info("pipeline.registration.completed", {
      documentId: created.id,
      status: "PROCESSING",
    });

    void this.processDocument(created.id, input.selectedPages);
    logger.info("pipeline.background_processing.triggered", {
      documentId: created.id,
    });
    return { documentId: created.id, status: "PROCESSING" };
  }

  public async processDocument(documentId: string, selectedPages?: number[]): Promise<void> {
    logger.info("pipeline.process_document.started", { documentId });
    const document = await this.repository.getById(documentId);
    if (!document) {
      logger.error("pipeline.process_document.document_not_found", { documentId });
      throw new Error("Document not found");
    }

    try {
      await this.generateNotebookStage(documentId, document.fileKey, document.mimeType, selectedPages);
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
    return this.repository.getDocumentsByUserId(userId, { includeDeleted: false });
  }

  public async getTrashDocuments(userId: string) {
    const documents = await this.repository.getDocumentsByUserId(userId, { includeDeleted: true });
    return documents.filter((item) => Boolean(item.deletedAt));
  }

  public async restoreDocument(documentId: string, userId: string): Promise<void> {
    const doc = await this.repository.getById(documentId, userId);
    if (!doc) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
    }
    if (!doc.deletedAt) {
      throw new AppError(409, "DOCUMENT_NOT_IN_TRASH", "Document is not in trash");
    }
    await this.repository.restoreById(documentId, userId);
  }

  public async deleteDocument(documentId: string, userId: string): Promise<void> {
    const doc = await this.repository.getById(documentId, userId);
    if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
    if (doc.deletedAt) {
      throw new AppError(409, "DOCUMENT_ALREADY_IN_TRASH", "Document is already in trash");
    }

    await this.repository.softDeleteById(documentId, userId);
  }

  public async deleteDocumentForever(documentId: string, userId: string): Promise<void> {
    await this.ensureOwnershipOrNotFound(documentId, userId);
    const doc = await this.repository.getById(documentId, userId);
    if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");

    await this.storageService.delete(doc.fileKey);
    await this.repository.deleteById(documentId, userId);
  }

  public async requestFlashcardImage(
    documentId: string,
    flashcardId: string,
    userId: string,
  ): Promise<FlashcardImageRequestResult> {
    await this.ensureOwnershipOrNotFound(documentId, userId);
    const card = await this.repository.getFlashcardById(documentId, flashcardId, userId);
    if (!card) {
      throw new AppError(404, "FLASHCARD_NOT_FOUND", "Flashcard not found");
    }
    if (card.visualNeedScore === null || card.visualNeedScore < 0.6) {
      throw new AppError(409, "FLASHCARD_VISUAL_NOT_REQUIRED", "Image is not required for this flashcard");
    }

    const currentStatus = card.imageStatus;
    const canQueue = currentStatus === null || currentStatus === "not_requested" || currentStatus === "failed";
    if (canQueue) {
      await this.repository.updateFlashcardImageStatus(documentId, flashcardId, "queued");
      logger.info("pipeline.flashcard_image.request.queued", {
        documentId,
        flashcardId,
      });
    }

    return {
      documentId,
      flashcard: {
        id: flashcardId,
        imageStatus: canQueue ? "queued" : (currentStatus as FlashcardImageRequestResult["flashcard"]["imageStatus"]),
        imageUrl: card.imageUrl ?? undefined,
        imagePrompt: card.imagePrompt ?? undefined,
        visualNeedScore: card.visualNeedScore ?? undefined,
      },
    };
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

  public async processQueuedFlashcardImages(
    batchSize: number,
  ): Promise<{ scanned: number; queued: number; failed: number }> {
    const queued = await this.repository.getQueuedFlashcards(batchSize);
    logger.debug("pipeline.flashcard_image.batch.started", {
      batchSize,
      queued: queued.length,
    });
    let processed = 0;
    let failed = 0;
    for (const item of queued) {
      try {
        await this.repository.updateFlashcardImageStatus(item.documentId, item.id, "processing");
        // Provider-agnostic scaffold: image generation provider not selected yet.
        await this.repository.updateFlashcardImageResult(item.documentId, item.id, {
          imageStatus: "failed",
          imagePrompt: item.imagePrompt ?? undefined,
          imageUrl: undefined,
        });
        failed += 1;
      } catch (error) {
        failed += 1;
        logger.error("pipeline.flashcard_image.process_failed", {
          flashcardId: item.id,
          documentId: item.documentId,
          message: error instanceof Error ? error.message : "Unexpected image queue error",
          error,
        });
      } finally {
        processed += 1;
      }
    }
    return {
      scanned: queued.length,
      queued: processed,
      failed,
    };
  }

  public async cleanupExpiredTrash(
    retentionDays: number,
    batchSize: number,
  ): Promise<{ scanned: number; deleted: number; failed: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expired = await this.repository.getExpiredTrashDocuments(cutoff, batchSize);
    let deleted = 0;
    let failed = 0;

    for (const item of expired) {
      try {
        await this.storageService.delete(item.fileKey);
        await this.repository.deleteById(item.id);
        deleted += 1;
      } catch (error) {
        failed += 1;
        logger.error("documents.trash.cleanup.item_failed", {
          documentId: item.id,
          fileKey: item.fileKey,
          message: error instanceof Error ? error.message : "Unexpected cleanup error",
          error,
        });
      }
    }

    return {
      scanned: expired.length,
      deleted,
      failed,
    };
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

  private mapMimeTypeToDocumentType(mimeType: string): DocumentType {
    if (mimeType === "application/pdf") {
      return "PDF";
    }
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      return "PPTX";
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
    selectedPages?: number[],
  ): Promise<void> {
    try {
      await this.repository.markStageProcessing(documentId, "notebook");
      const bytes = await this.storageService.download(fileKey);
      logger.debug("pipeline.process_document.storage_download.completed", {
        documentId,
        fileKey,
        byteLength: bytes.byteLength,
      });
      const text = await this.extractionService.extractText({ mimeType, bytes, selectedPages });
      if (text.length > env.maxExtractedChars) {
        throw new Error(
          `Extracted text exceeds MAX_EXTRACTED_CHARS=${env.maxExtractedChars}. Please narrow selected pages.`,
        );
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
      await this.repository.markStageFailed(documentId, "notebook", message);
      throw error;
    }
  }

  private async generateFlashcardsStage(documentId: string): Promise<void> {
    try {
      await this.repository.markStageProcessing(documentId, "flashcards");
      const notebookText = await this.getNotebookTextFromDb(documentId);
      const flashcardsCore = await this.runWithTimeout(
        "flashcards",
        () => this.aiService.generateFlashcardsCoreFromNotebook(notebookText),
        documentId,
      );
      await this.repository.saveFlashcardsArtifacts(documentId, flashcardsCore.flashcards);
      logger.info("pipeline.stage.completed", {
        documentId,
        stage: "flashcards",
        flashcards: flashcardsCore.flashcards.length,
      });

      void this.enrichFlashcardsStage(documentId, notebookText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Flashcards stage failed";
      await this.repository.markStageFailed(documentId, "flashcards", message);
      throw error;
    }
  }

  private async enrichFlashcardsStage(documentId: string, notebookText: string): Promise<void> {
    try {
      await this.repository.markFlashcardsEnrichmentProcessing(documentId);
      const cards = await this.repository.getFlashcardsForProcessing(documentId);
      if (cards.length === 0) {
        await this.repository.markFlashcardsEnrichmentCompleted(documentId);
        return;
      }
      await this.repository.setFlashcardsDefaultMetadata(documentId);
      const enrichment = await this.runWithTimeout(
        "flashcards",
        () =>
          this.aiService.enrichFlashcardsMetadata(
            notebookText,
            cards.map((item) => ({ question: item.question, answer: item.answer })),
          ),
        documentId,
      );
      const normalized = this.normalizeEnrichment(cards.length, enrichment.enrichment);
      await this.repository.applyFlashcardsEnrichment(documentId, normalized);
      await this.repository.markFlashcardsEnrichmentCompleted(documentId);
      logger.info("pipeline.flashcards.enrichment.completed", {
        documentId,
        cards: cards.length,
        enrichment: normalized.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Flashcards enrichment failed";
      await this.repository.markFlashcardsEnrichmentFailed(documentId, message);
      logger.error("pipeline.flashcards.enrichment.failed", {
        documentId,
        message,
      });
    }
  }

  private normalizeEnrichment(
    totalCards: number,
    enrichment: Array<{
      index: number;
      topic?: string;
      iconKey?: string;
      visualNeedScore?: number;
      imagePrompt?: string;
      requiresPointer?: boolean;
      pointerX?: number;
      pointerY?: number;
    }>,
  ) {
    const maxVisualCards = Math.max(1, Math.min(6, Math.floor(totalCards * 0.3)));
    const sortedVisual = enrichment
      .filter((item) => item.visualNeedScore !== undefined)
      .sort((a, b) => (b.visualNeedScore ?? 0) - (a.visualNeedScore ?? 0));
    const allowedVisualIndexes = new Set(
      sortedVisual.slice(0, maxVisualCards).map((item) => item.index),
    );

    return enrichment.map((item) => {
      const scoreRaw = item.visualNeedScore ?? 0.2;
      const score = Math.max(0, Math.min(1, scoreRaw));
      const canBeVisual = score >= 0.7 && allowedVisualIndexes.has(item.index);

      if (!canBeVisual) {
        return {
          ...item,
          visualNeedScore: Math.min(score, 0.4),
          imagePrompt: undefined,
          requiresPointer: false,
          pointerX: undefined,
          pointerY: undefined,
        };
      }

      return {
        ...item,
        visualNeedScore: Math.max(score, 0.7),
        requiresPointer: item.requiresPointer ?? false,
      };
    });
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
      await this.repository.markStageFailed(documentId, "quizzes", message);
      throw error;
    }
  }
}
