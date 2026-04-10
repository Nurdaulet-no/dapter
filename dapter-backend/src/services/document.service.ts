import type { DocumentType } from "@prisma/client";
import { logger } from "../config/logger";
import type { IDocumentRepository } from "../repositories/document.repository";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";

export interface IDocumentService {
  uploadAndQueue(input: {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ documentId: string; status: "PROCESSING" }>;
  processDocument(documentId: string): Promise<void>;
  getStatus(documentId: string): ReturnType<IDocumentRepository["getDocumentStatus"]>;
}

export class DocumentService implements IDocumentService {
  public constructor(
    private readonly repository: IDocumentRepository,
    private readonly storageService: IStorageService,
    private readonly extractionService: IExtractionService,
    private readonly aiService: IAIService,
  ) {}

  public async uploadAndQueue(input: {
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

  public getStatus(documentId: string) {
    logger.debug("pipeline.status_lookup.started", { documentId });
    return this.repository.getDocumentStatus(documentId);
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
