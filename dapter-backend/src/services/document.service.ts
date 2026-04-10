import type { DocumentType } from "@prisma/client";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IDocumentRepository } from "../repositories/document.repository";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";

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
  deleteDocument(documentId: string, userId: string): Promise<void>;
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
      const bytes = await this.storageService.download(document.fileKey);
      logger.debug("pipeline.process_document.storage_download.completed", {
        documentId,
        fileKey: document.fileKey,
        byteLength: bytes.byteLength,
      });
      const text = await this.extractionService.extractText({
        mimeType: document.mimeType,
        bytes,
      });
      logger.debug("pipeline.process_document.extraction.completed", {
        documentId,
        textLength: text.length,
      });
      const artifacts = await this.aiService.generateLearningArtifacts(text);
      logger.debug("pipeline.process_document.ai.completed", {
        documentId,
        notes: artifacts.notes.length,
        flashcards: artifacts.flashcards.length,
        quizzes: artifacts.quizzes.length,
      });
      await this.repository.markCompleted(documentId, artifacts);
      logger.info("pipeline.process_document.completed", {
        documentId,
        status: "COMPLETED",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error while processing document";
      logger.error("pipeline.process_document.failed", {
        documentId,
        message,
        error,
      });
      await this.repository.markFailed(documentId, message);
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

  public async deleteDocument(documentId: string, userId: string): Promise<void> {
    await this.ensureOwnershipOrNotFound(documentId, userId);
    const doc = await this.repository.getById(documentId, userId);
    if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");

    await this.storageService.delete(doc.fileKey);
    await this.repository.deleteById(documentId, userId);
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
}
