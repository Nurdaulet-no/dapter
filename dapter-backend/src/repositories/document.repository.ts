import type { DocumentStatus, PrismaClient } from "@prisma/client";
import { logger } from "../config/logger";
import type {
  DocumentListItemView,
  DocumentFlashcardsView,
  DocumentNotesView,
  DocumentQuizzesView,
  DocumentRegistrationInput,
  DocumentStatusView,
  LearningArtifactInput,
} from "../types/document";

export interface IDocumentRepository {
  createDocument(input: DocumentRegistrationInput): Promise<{ id: string }>;
  getById(id: string, userId?: string): Promise<{
    id: string;
    userId: string;
    fileKey: string;
    fileName: string;
    mimeType: string;
    status: DocumentStatus;
    error: string | null;
  } | null>;
  markCompleted(id: string, artifacts: LearningArtifactInput): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  getDocumentStatus(id: string, userId: string): Promise<DocumentStatusView | null>;
  getDocumentFlashcards(id: string, userId: string): Promise<DocumentFlashcardsView | null>;
  getDocumentQuizzes(id: string, userId: string): Promise<DocumentQuizzesView | null>;
  getDocumentNotes(id: string, userId: string): Promise<DocumentNotesView | null>;
  getDocumentsByUserId(userId: string): Promise<DocumentListItemView[]>;
  deleteById(id: string, userId: string): Promise<void>;
}

export class DocumentRepository implements IDocumentRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createDocument(input: DocumentRegistrationInput): Promise<{ id: string }> {
    logger.debug("repository.document.create.started", {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      fileKey: input.fileKey,
      type: input.type,
    });
    const created = await this.prisma.document.create({ data: input, select: { id: true } });
    logger.info("repository.document.create.completed", {
      documentId: created.id,
    });
    return created;
  }

  public async getById(id: string, userId?: string): Promise<{
    id: string;
    userId: string;
    fileKey: string;
    fileName: string;
    mimeType: string;
    status: DocumentStatus;
    error: string | null;
  } | null> {
    const document = await this.prisma.document.findFirst({
      where: userId ? { id, userId } : { id },
      select: {
        id: true,
        userId: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
        status: true,
        error: true,
      },
    });
    logger.debug("repository.document.get_by_id.completed", {
      documentId: id,
      found: Boolean(document),
      status: document?.status,
    });
    return document;
  }

  public async markCompleted(id: string, artifacts: LearningArtifactInput): Promise<void> {
    logger.info("repository.document.mark_completed.started", {
      documentId: id,
      notes: artifacts.notes.length,
      flashcards: artifacts.flashcards.length,
      quizzes: artifacts.quizzes.length,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.note.createMany({
        data: artifacts.notes.map((item) => ({ ...item, documentId: id })),
      });
      await tx.flashcard.createMany({
        data: artifacts.flashcards.map((item) => ({ ...item, documentId: id })),
      });
      await tx.quiz.createMany({
        data: artifacts.quizzes.map((item) => ({ ...item, documentId: id })),
      });
      await tx.document.update({
        where: { id },
        data: { status: "COMPLETED", error: null },
      });
    });
    logger.info("repository.document.mark_completed.completed", {
      documentId: id,
      status: "COMPLETED",
    });
  }

  public async markFailed(id: string, errorMessage: string): Promise<void> {
    logger.error("repository.document.mark_failed.started", {
      documentId: id,
      errorMessage,
    });
    await this.prisma.document.update({
      where: { id },
      data: { status: "FAILED", error: errorMessage },
    });
    logger.error("repository.document.mark_failed.completed", {
      documentId: id,
      status: "FAILED",
    });
  }

  public async getDocumentStatus(id: string, userId: string): Promise<DocumentStatusView | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: {
        notes: true,
        flashcards: true,
        quizzes: true,
      },
    });

    if (!doc) {
      logger.debug("repository.document.get_status.not_found", {
        documentId: id,
      });
      return null;
    }

    logger.debug("repository.document.get_status.completed", {
      documentId: id,
      status: doc.status,
      notes: doc.notes.length,
      flashcards: doc.flashcards.length,
      quizzes: doc.quizzes.length,
    });
    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      notes:
        doc.status === "COMPLETED"
          ? doc.notes.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
            }))
          : undefined,
      flashcards:
        doc.status === "COMPLETED"
          ? doc.flashcards.map((item) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
            }))
          : undefined,
      quizzes:
        doc.status === "COMPLETED"
          ? doc.quizzes.map((item) => ({
              id: item.id,
              question: item.question,
              options: item.options as string[],
              correctOption: item.correctOption,
              explanation: item.explanation ?? undefined,
            }))
          : undefined,
    };
  }

  public async getDocumentFlashcards(id: string, userId: string): Promise<DocumentFlashcardsView | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { flashcards: true },
    });

    if (!doc) {
      return null;
    }

    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      flashcards:
        doc.status === "COMPLETED"
          ? doc.flashcards.map((item) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
            }))
          : undefined,
    };
  }

  public async getDocumentQuizzes(id: string, userId: string): Promise<DocumentQuizzesView | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { quizzes: true },
    });

    if (!doc) {
      return null;
    }

    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      quizzes:
        doc.status === "COMPLETED"
          ? doc.quizzes.map((item) => ({
              id: item.id,
              question: item.question,
              options: item.options as string[],
              correctOption: item.correctOption,
              explanation: item.explanation ?? undefined,
            }))
          : undefined,
    };
  }

  public async getDocumentNotes(id: string, userId: string): Promise<DocumentNotesView | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { notes: true },
    });

    if (!doc) {
      return null;
    }

    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      notes:
        doc.status === "COMPLETED"
          ? doc.notes.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
            }))
          : undefined,
    };
  }

  public async getDocumentsByUserId(userId: string): Promise<DocumentListItemView[]> {
    const rows = await this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rows.map((row) => ({
      documentId: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  public async deleteById(id: string, userId: string): Promise<void> {
    await this.prisma.document.deleteMany({
      where: { id, userId },
    });
  }
}
