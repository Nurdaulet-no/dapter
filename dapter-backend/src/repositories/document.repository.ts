import type { DocumentStatus, PrismaClient } from "@prisma/client";
import { logger } from "../config/logger";
import type {
  ArtifactStageStatus,
  DocumentListItemView,
  DocumentFlashcardsView,
  DocumentNotesView,
  DocumentQuizzesView,
  DocumentRegistrationInput,
  DocumentStatusView,
  FlashcardImageStatus,
  LearningArtifactInput,
} from "../types/document";

const toFlashcardImageStatus = (
  value: string | null,
): FlashcardImageStatus | undefined => {
  if (
    value === "not_requested" ||
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  ) {
    return value;
  }
  return undefined;
};

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
    notebookStatus: ArtifactStageStatus;
    notebookError: string | null;
    flashcardsStatus: ArtifactStageStatus;
    flashcardsError: string | null;
    flashcardsEnrichmentStatus: ArtifactStageStatus;
    flashcardsEnrichmentError: string | null;
    quizzesStatus: ArtifactStageStatus;
    quizzesError: string | null;
    deletedAt: Date | null;
  } | null>;
  markStageProcessing(id: string, stage: "notebook" | "flashcards" | "quizzes"): Promise<void>;
  markFlashcardsEnrichmentProcessing(id: string): Promise<void>;
  markFlashcardsEnrichmentCompleted(id: string): Promise<void>;
  markFlashcardsEnrichmentFailed(id: string, errorMessage: string): Promise<void>;
  saveNotebookArtifacts(id: string, notes: LearningArtifactInput["notes"]): Promise<void>;
  saveFlashcardsArtifacts(id: string, flashcards: LearningArtifactInput["flashcards"]): Promise<void>;
  saveQuizzesArtifacts(id: string, quizzes: LearningArtifactInput["quizzes"]): Promise<void>;
  markStageFailed(
    id: string,
    stage: "notebook" | "flashcards" | "quizzes",
    errorMessage: string,
  ): Promise<void>;
  getDocumentStatus(id: string, userId: string): Promise<DocumentStatusView | null>;
  getDocumentFlashcards(id: string, userId: string): Promise<DocumentFlashcardsView | null>;
  getDocumentQuizzes(id: string, userId: string): Promise<DocumentQuizzesView | null>;
  getDocumentNotes(id: string, userId: string): Promise<DocumentNotesView | null>;
  getNotesForProcessing(documentId: string): Promise<Array<{ title: string; content: string }>>;
  getFlashcardsForProcessing(documentId: string): Promise<Array<{ id: string; question: string; answer: string }>>;
  applyFlashcardsEnrichment(
    documentId: string,
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
  ): Promise<void>;
  setFlashcardsDefaultMetadata(documentId: string): Promise<void>;
  getDocumentsByUserId(userId: string, options?: { includeDeleted?: boolean }): Promise<DocumentListItemView[]>;
  getExpiredTrashDocuments(cutoff: Date, limit: number): Promise<Array<{ id: string; fileKey: string }>>;
  softDeleteById(id: string, userId: string): Promise<void>;
  restoreById(id: string, userId: string): Promise<void>;
  deleteById(id: string, userId?: string): Promise<void>;
  getFlashcardById(
    documentId: string,
    flashcardId: string,
    userId: string,
  ): Promise<{
    id: string;
    imageStatus: string | null;
    imageUrl: string | null;
    imagePrompt: string | null;
    visualNeedScore: number | null;
  } | null>;
  updateFlashcardImageStatus(
    documentId: string,
    flashcardId: string,
    imageStatus: FlashcardImageStatus,
  ): Promise<void>;
  updateFlashcardImageResult(
    documentId: string,
    flashcardId: string,
    result: { imageStatus: FlashcardImageStatus; imageUrl?: string; imagePrompt?: string },
  ): Promise<void>;
  getQueuedFlashcards(limit: number): Promise<
    Array<{ id: string; documentId: string; imagePrompt: string | null; visualNeedScore: number | null }>
  >;
}

export class DocumentRepository implements IDocumentRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createDocument(input: DocumentRegistrationInput): Promise<{ id: string }> {
    logger.debug("repository.document.create.started", {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      fileKey: input.fileKey,
      selectedStartPage: input.selectedStartPage,
      selectedEndPage: input.selectedEndPage,
      type: input.type,
    });
    const created = await this.prisma.document.create({
      data: {
        userId: input.userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        fileKey: input.fileKey,
        fileUrl: input.fileUrl,
        selectedStartPage: input.selectedStartPage,
        selectedEndPage: input.selectedEndPage,
        type: input.type,
      },
      select: { id: true },
    });
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
    notebookStatus: ArtifactStageStatus;
    notebookError: string | null;
    flashcardsStatus: ArtifactStageStatus;
    flashcardsError: string | null;
    flashcardsEnrichmentStatus: ArtifactStageStatus;
    flashcardsEnrichmentError: string | null;
    quizzesStatus: ArtifactStageStatus;
    quizzesError: string | null;
    deletedAt: Date | null;
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
        notebookStatus: true,
        notebookError: true,
          flashcardsStatus: true,
          flashcardsError: true,
          flashcardsEnrichmentStatus: true,
          flashcardsEnrichmentError: true,
          quizzesStatus: true,
          quizzesError: true,
        deletedAt: true,
      },
    });
    logger.debug("repository.document.get_by_id.completed", {
      documentId: id,
      found: Boolean(document),
      status: document?.status,
      notebookStatus: document?.notebookStatus,
      flashcardsStatus: document?.flashcardsStatus,
      quizzesStatus: document?.quizzesStatus,
      deletedAt: document?.deletedAt?.toISOString(),
    });
    return document;
  }

  public async markStageProcessing(
    id: string,
    stage: "notebook" | "flashcards" | "quizzes",
  ): Promise<void> {
    const stageColumn =
      stage === "notebook"
        ? {
            notebookStatus: "PROCESSING" as const,
            notebookError: null,
            flashcardsStatus: "PENDING" as const,
            flashcardsError: null,
            flashcardsEnrichmentStatus: "PENDING" as const,
            flashcardsEnrichmentError: null,
            quizzesStatus: "PENDING" as const,
            quizzesError: null,
          }
        : stage === "flashcards"
          ? {
              flashcardsStatus: "PROCESSING" as const,
              flashcardsError: null,
              flashcardsEnrichmentStatus: "PENDING" as const,
              flashcardsEnrichmentError: null,
            }
          : { quizzesStatus: "PROCESSING" as const, quizzesError: null };
    await this.prisma.document.update({
      where: { id },
      data: {
        ...stageColumn,
        status: "PROCESSING",
        error: null,
      },
    });
  }

  public async markFlashcardsEnrichmentProcessing(id: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: {
        flashcardsEnrichmentStatus: "PROCESSING",
        flashcardsEnrichmentError: null,
      },
    });
  }

  public async markFlashcardsEnrichmentCompleted(id: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: {
        flashcardsEnrichmentStatus: "COMPLETED",
        flashcardsEnrichmentError: null,
      },
    });
  }

  public async markFlashcardsEnrichmentFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: {
        flashcardsEnrichmentStatus: "FAILED",
        flashcardsEnrichmentError: errorMessage,
      },
    });
  }

  public async saveNotebookArtifacts(id: string, notes: LearningArtifactInput["notes"]): Promise<void> {
    logger.info("repository.document.save_notebook.started", {
      documentId: id,
      notes: notes.length,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.note.deleteMany({ where: { documentId: id } });
      await tx.flashcard.deleteMany({ where: { documentId: id } });
      await tx.quiz.deleteMany({ where: { documentId: id } });
      await tx.note.createMany({
        data: notes.map((item) => ({ ...item, documentId: id })),
      });
      await tx.document.update({
        where: { id },
        data: {
          notebookStatus: "COMPLETED",
          notebookError: null,
          flashcardsEnrichmentStatus: "PENDING",
          flashcardsEnrichmentError: null,
          status: "PROCESSING",
          error: null,
        },
      });
    });
    logger.info("repository.document.save_notebook.completed", {
      documentId: id,
    });
  }

  public async saveFlashcardsArtifacts(
    id: string,
    flashcards: LearningArtifactInput["flashcards"],
  ): Promise<void> {
    logger.info("repository.document.save_flashcards.started", {
      documentId: id,
      flashcards: flashcards.length,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.flashcard.deleteMany({ where: { documentId: id } });
      await tx.flashcard.createMany({
        data: flashcards.map((item) => ({ ...item, documentId: id })),
      });
      const current = await tx.document.findUnique({
        where: { id },
        select: { notebookStatus: true, quizzesStatus: true },
      });
      const shouldComplete =
        current?.notebookStatus === "COMPLETED" && current?.quizzesStatus === "COMPLETED";
      await tx.document.update({
        where: { id },
        data: {
          flashcardsStatus: "COMPLETED",
          flashcardsError: null,
          status: shouldComplete ? "COMPLETED" : "PROCESSING",
          error: null,
          flashcardsEnrichmentStatus: "PENDING",
          flashcardsEnrichmentError: null,
        },
      });
    });
    logger.info("repository.document.save_flashcards.completed", {
      documentId: id,
    });
  }

  public async saveQuizzesArtifacts(id: string, quizzes: LearningArtifactInput["quizzes"]): Promise<void> {
    logger.info("repository.document.save_quizzes.started", {
      documentId: id,
      quizzes: quizzes.length,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.quiz.deleteMany({ where: { documentId: id } });
      await tx.quiz.createMany({
        data: quizzes.map((item) => ({ ...item, documentId: id })),
      });
      const current = await tx.document.findUnique({
        where: { id },
        select: { notebookStatus: true, flashcardsStatus: true },
      });
      const shouldComplete =
        current?.notebookStatus === "COMPLETED" && current?.flashcardsStatus === "COMPLETED";
      await tx.document.update({
        where: { id },
        data: {
          quizzesStatus: "COMPLETED",
          quizzesError: null,
          status: shouldComplete ? "COMPLETED" : "PROCESSING",
          error: null,
        },
      });
    });
    logger.info("repository.document.save_quizzes.completed", {
      documentId: id,
    });
  }

  public async markStageFailed(
    id: string,
    stage: "notebook" | "flashcards" | "quizzes",
    errorMessage: string,
  ): Promise<void> {
    logger.error("repository.document.mark_stage_failed.started", {
      documentId: id,
      stage,
      errorMessage,
    });
    const stageColumn =
      stage === "notebook"
        ? { notebookStatus: "FAILED" as const, notebookError: errorMessage }
        : stage === "flashcards"
          ? {
              flashcardsStatus: "FAILED" as const,
              flashcardsError: errorMessage,
              flashcardsEnrichmentStatus: "FAILED" as const,
              flashcardsEnrichmentError: errorMessage,
            }
          : { quizzesStatus: "FAILED" as const, quizzesError: errorMessage };
    await this.prisma.document.update({
      where: { id },
      data: {
        ...stageColumn,
        status: "FAILED",
        error: errorMessage,
      },
    });
    logger.error("repository.document.mark_stage_failed.completed", {
      documentId: id,
      stage,
      status: "FAILED",
    });
  }

  public async getDocumentStatus(id: string, userId: string): Promise<DocumentStatusView | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: {
        notes: true,
        flashcards: {
          select: {
            id: true,
            question: true,
            answer: true,
            topic: true,
            iconKey: true,
            visualNeedScore: true,
            imagePrompt: true,
            imageStatus: true,
            imageUrl: true,
            requiresPointer: true,
            pointerX: true,
            pointerY: true,
          },
        },
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
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      flashcardsEnrichmentStatus: doc.flashcardsEnrichmentStatus,
      flashcardsEnrichmentError: doc.flashcardsEnrichmentError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      notes:
        doc.notebookStatus === "COMPLETED"
          ? doc.notes.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
            }))
          : undefined,
      flashcards:
        doc.flashcardsStatus === "COMPLETED"
          ? doc.flashcards.map((item) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
              topic: item.topic ?? undefined,
              iconKey: item.iconKey ?? undefined,
              visualNeedScore: item.visualNeedScore ?? undefined,
              imagePrompt: item.imagePrompt ?? undefined,
              imageStatus: toFlashcardImageStatus(item.imageStatus),
              imageUrl: item.imageUrl ?? undefined,
              requiresPointer: item.requiresPointer ?? undefined,
              pointerX: item.pointerX ?? undefined,
              pointerY: item.pointerY ?? undefined,
            }))
          : undefined,
      quizzes:
        doc.quizzesStatus === "COMPLETED"
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
      include: {
        flashcards: {
          select: {
            id: true,
            question: true,
            answer: true,
            topic: true,
            iconKey: true,
            visualNeedScore: true,
            imagePrompt: true,
            imageStatus: true,
            imageUrl: true,
            requiresPointer: true,
            pointerX: true,
            pointerY: true,
          },
        },
      },
    });

    if (!doc) {
      return null;
    }

    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      flashcardsEnrichmentStatus: doc.flashcardsEnrichmentStatus,
      flashcardsEnrichmentError: doc.flashcardsEnrichmentError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      flashcards:
        doc.flashcardsStatus === "COMPLETED"
          ? doc.flashcards.map((item) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
              topic: item.topic ?? undefined,
              iconKey: item.iconKey ?? undefined,
              visualNeedScore: item.visualNeedScore ?? undefined,
              imagePrompt: item.imagePrompt ?? undefined,
              imageStatus: toFlashcardImageStatus(item.imageStatus),
              imageUrl: item.imageUrl ?? undefined,
              requiresPointer: item.requiresPointer ?? undefined,
              pointerX: item.pointerX ?? undefined,
              pointerY: item.pointerY ?? undefined,
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
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      flashcardsEnrichmentStatus: doc.flashcardsEnrichmentStatus,
      flashcardsEnrichmentError: doc.flashcardsEnrichmentError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      quizzes:
        doc.quizzesStatus === "COMPLETED"
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
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      flashcardsEnrichmentStatus: doc.flashcardsEnrichmentStatus,
      flashcardsEnrichmentError: doc.flashcardsEnrichmentError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      notes:
        doc.notebookStatus === "COMPLETED"
          ? doc.notes.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
            }))
          : undefined,
    };
  }

  public async getNotesForProcessing(documentId: string): Promise<Array<{ title: string; content: string }>> {
    const rows = await this.prisma.note.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
      select: {
        title: true,
        content: true,
      },
    });
    return rows;
  }

  public async getFlashcardsForProcessing(
    documentId: string,
  ): Promise<Array<{ id: string; question: string; answer: string }>> {
    return this.prisma.flashcard.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        question: true,
        answer: true,
      },
    });
  }

  public async applyFlashcardsEnrichment(
    documentId: string,
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
  ): Promise<void> {
    const cards = await this.prisma.flashcard.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const updates = enrichment
      .filter((item) => item.index >= 0 && item.index < cards.length)
      .map((item) => {
        const target = cards[item.index];
        if (!target) {
          return null;
        }
        return this.prisma.flashcard.update({
          where: { id: target.id },
          data: {
            topic: item.topic,
            iconKey: item.iconKey,
            visualNeedScore: item.visualNeedScore,
            imagePrompt: item.imagePrompt,
            imageStatus:
              item.visualNeedScore !== undefined && item.visualNeedScore >= 0.6
                ? ("not_requested" as const)
                : null,
            requiresPointer: item.requiresPointer,
            pointerX: item.pointerX,
            pointerY: item.pointerY,
          },
        });
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  public async setFlashcardsDefaultMetadata(documentId: string): Promise<void> {
    await this.prisma.flashcard.updateMany({
      where: { documentId },
      data: {
        topic: "General",
        iconKey: "book-open",
        visualNeedScore: 0.2,
        imagePrompt: null,
        imageStatus: null,
        requiresPointer: false,
        pointerX: null,
        pointerY: null,
      },
    });
  }

  public async getDocumentsByUserId(
    userId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DocumentListItemView[]> {
    const rows = await this.prisma.document.findMany({
      where: options?.includeDeleted ? { userId } : { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        deletedAt: true,
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
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  public async getExpiredTrashDocuments(
    cutoff: Date,
    limit: number,
  ): Promise<Array<{ id: string; fileKey: string }>> {
    const rows = await this.prisma.document.findMany({
      where: {
        deletedAt: {
          not: null,
          lte: cutoff,
        },
      },
      orderBy: { deletedAt: "asc" },
      take: limit,
      select: {
        id: true,
        fileKey: true,
      },
    });

    return rows;
  }

  public async softDeleteById(id: string, userId: string): Promise<void> {
    await this.prisma.document.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  public async restoreById(id: string, userId: string): Promise<void> {
    await this.prisma.document.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  }

  public async deleteById(id: string, userId?: string): Promise<void> {
    await this.prisma.document.deleteMany({
      where: userId ? { id, userId } : { id },
    });
  }

  public async getFlashcardById(documentId: string, flashcardId: string, userId: string): Promise<{
    id: string;
    imageStatus: string | null;
    imageUrl: string | null;
    imagePrompt: string | null;
    visualNeedScore: number | null;
  } | null> {
    return this.prisma.flashcard.findFirst({
      where: {
        id: flashcardId,
        documentId,
        document: {
          userId,
        },
      },
      select: {
        id: true,
        imageStatus: true,
        imageUrl: true,
        imagePrompt: true,
        visualNeedScore: true,
      },
    });
  }

  public async updateFlashcardImageStatus(
    documentId: string,
    flashcardId: string,
    imageStatus: FlashcardImageStatus,
  ): Promise<void> {
    await this.prisma.flashcard.updateMany({
      where: { id: flashcardId, documentId },
      data: { imageStatus },
    });
  }

  public async updateFlashcardImageResult(
    documentId: string,
    flashcardId: string,
    result: { imageStatus: FlashcardImageStatus; imageUrl?: string; imagePrompt?: string },
  ): Promise<void> {
    await this.prisma.flashcard.updateMany({
      where: { id: flashcardId, documentId },
      data: {
        imageStatus: result.imageStatus,
        imageUrl: result.imageUrl,
        imagePrompt: result.imagePrompt,
      },
    });
  }

  public async getQueuedFlashcards(
    limit: number,
  ): Promise<Array<{ id: string; documentId: string; imagePrompt: string | null; visualNeedScore: number | null }>> {
    return this.prisma.flashcard.findMany({
      where: { imageStatus: "queued" },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        documentId: true,
        imagePrompt: true,
        visualNeedScore: true,
      },
    });
  }
}
