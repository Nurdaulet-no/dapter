import { pocketbase } from "../config/pocketbase";
import type {
  ArtifactStageStatus,
  DocumentFlashcardsView,
  DocumentListItemView,
  DocumentNotesView,
  DocumentQuizzesView,
  DocumentRegistrationInput,
  DocumentStatusView,
  LearningArtifactInput,
} from "../types/document";
import type { PocketBaseDocumentStatus } from "../types/pocketbase";
import type { IDocumentRepository } from "./document.repository";

interface PBRecord {
  id: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

const toStage = (value: unknown): ArtifactStageStatus =>
  value === "PROCESSING" || value === "COMPLETED" || value === "FAILED" ? value : "PENDING";

const toDocStatus = (value: unknown): PocketBaseDocumentStatus =>
  value === "COMPLETED" || value === "FAILED" ? value : "PROCESSING";

const toDate = (value: unknown): Date | null => {
  if (typeof value === "string" && value.length > 0) {
    return new Date(value);
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

const escapeFilter = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const byCreatedAsc = <T extends { createdAt: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const byCreatedDesc = <T extends { createdAt: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

type PBNote = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
};

type PBFlashcardDeck = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
};

type PBFlashcard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  imagePrompt: string;
  imageUrls: string[];
  tags: string[];
  sortOrder: number;
  createdAt: string;
};

type PBQuiz = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
};

type PBQuizQuestion = {
  id: string;
  quizId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  tags: string[];
  imagePrompt: string;
  imageUrls: string[];
  sortOrder: number;
  createdAt: string;
};

export class PocketBaseDocumentRepository implements IDocumentRepository {
  public async createDocument(input: DocumentRegistrationInput): Promise<{ id: string }> {
    const created = (await pocketbase.collection("documents").create({
      owner: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storageFileId: input.fileKey,
      type: input.type,
      status: "PROCESSING",
      notebookStatus: "PENDING",
      flashcardsStatus: "PENDING",
      quizzesStatus: "PENDING",
    })) as PBRecord;
    return { id: created.id };
  }

  public async getById(id: string, userId?: string) {
    const record = (await pocketbase.collection("documents").getOne(id).catch(() => null)) as
      | PBRecord
      | null;
    if (!record) {
      return null;
    }
    const owner = toStringOrNull(record.owner);
    if (userId && owner !== userId) {
      return null;
    }
    return {
      id: record.id,
      userId: owner ?? "",
      fileKey: toStringOrNull(record.storageFileId) ?? "",
      fileName: toStringOrNull(record.fileName) ?? "",
      mimeType: toStringOrNull(record.mimeType) ?? "",
      status: toDocStatus(record.status),
      error: toStringOrNull(record.error),
      notebookStatus: toStage(record.notebookStatus),
      notebookError: toStringOrNull(record.notebookError),
      flashcardsStatus: toStage(record.flashcardsStatus),
      flashcardsError: toStringOrNull(record.flashcardsError),
      quizzesStatus: toStage(record.quizzesStatus),
      quizzesError: toStringOrNull(record.quizzesError),
      deletedAt: toDate(record.deletedAt),
    };
  }

  public async markStageProcessing(
    id: string,
    stage: "notebook" | "flashcards" | "quizzes",
  ): Promise<void> {
    const data =
      stage === "notebook"
        ? {
            notebookStatus: "PROCESSING",
            notebookError: null,
            flashcardsStatus: "PENDING",
            flashcardsError: null,
            quizzesStatus: "PENDING",
            quizzesError: null,
          }
        : stage === "flashcards"
          ? {
              flashcardsStatus: "PROCESSING",
              flashcardsError: null,
            }
          : {
              quizzesStatus: "PROCESSING",
              quizzesError: null,
            };
    await pocketbase.collection("documents").update(id, {
      ...data,
      status: "PROCESSING",
      error: null,
    });
  }

  public async saveNotebookArtifacts(id: string, notes: LearningArtifactInput["notes"]): Promise<void> {
    await this.deleteAllArtifacts(id);
    await Promise.all(
      notes.map((item, index) =>
        pocketbase.collection("notes").create({
          document: id,
          title: item.title,
          content: item.content,
          sortOrder: index,
        }),
      ),
    );

    await pocketbase.collection("documents").update(id, {
      notebookStatus: "COMPLETED",
      notebookError: null,
      status: "PROCESSING",
      error: null,
    });
  }

  public async saveFlashcardDecksArtifacts(
    id: string,
    flashcardDecks: LearningArtifactInput["flashcardDecks"],
  ): Promise<void> {
    await this.deleteFlashcardsArtifacts(id);

    for (let deckIndex = 0; deckIndex < flashcardDecks.length; deckIndex += 1) {
      const deck = flashcardDecks[deckIndex];
      if (!deck) {
        continue;
      }
      const createdDeck = (await pocketbase.collection("flashcard_decks").create({
        document: id,
        externalId: deck.id,
        title: deck.title,
        description: deck.description ?? null,
        sortOrder: deckIndex,
      })) as PBRecord;

      await Promise.all(
        deck.cards.map((card, cardIndex) =>
          pocketbase.collection("flashcards").create({
            document: id,
            deck: createdDeck.id,
            externalId: card.id,
            front: card.front,
            back: card.back,
            imagePrompt: card.imagePrompt,
            imageUrls: card.imageUrls ?? [],
            tags: card.tags ?? [],
            sortOrder: cardIndex,
          }),
        ),
      );
    }

    await pocketbase.collection("documents").update(id, {
      flashcardsStatus: "PROCESSING",
      flashcardsError: null,
      status: "PROCESSING",
      error: null,
    });
  }

  public async getFlashcardsForImageGeneration(
    documentId: string,
  ): Promise<Array<{ id: string; imagePrompt: string }>> {
    const rows = (await pocketbase.collection("flashcards").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];

    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        imagePrompt: toStringOrNull(item.imagePrompt) ?? "",
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).map((item) => ({ id: item.id, imagePrompt: item.imagePrompt }));
  }

  public async updateFlashcardImageUrls(
    documentId: string,
    flashcardId: string,
    imageUrls: string[],
  ): Promise<void> {
    const card = (await pocketbase.collection("flashcards").getOne(flashcardId).catch(() => null)) as
      | PBRecord
      | null;
    if (!card || toStringOrNull(card.document) !== documentId) {
      return;
    }
    await pocketbase.collection("flashcards").update(flashcardId, {
      imageUrls,
    });
  }

  public async markFlashcardsGenerationCompleted(id: string): Promise<void> {
    const current = await this.getById(id);
    const shouldComplete =
      current?.notebookStatus === "COMPLETED" && current?.quizzesStatus === "COMPLETED";
    await pocketbase.collection("documents").update(id, {
      flashcardsStatus: "COMPLETED",
      flashcardsError: null,
      status: shouldComplete ? "COMPLETED" : "PROCESSING",
      error: null,
    });
  }

  public async saveQuizzesArtifacts(id: string, quizzes: LearningArtifactInput["quizzes"]): Promise<void> {
    await this.deleteQuizzesArtifacts(id);

    for (let quizIndex = 0; quizIndex < quizzes.length; quizIndex += 1) {
      const quiz = quizzes[quizIndex];
      if (!quiz) {
        continue;
      }
      const createdQuiz = (await pocketbase.collection("quizzes").create({
        document: id,
        externalId: quiz.id,
        title: quiz.title,
        description: quiz.description ?? null,
        sortOrder: quizIndex,
      })) as PBRecord;

      await Promise.all(
        quiz.questions.map((question, questionIndex) =>
          pocketbase.collection("quiz_questions").create({
            document: id,
            quiz: createdQuiz.id,
            externalId: question.id,
            question: question.question,
            options: question.options,
            correctIndex: question.correctIndex,
            explanation: question.explanation ?? null,
            tags: question.tags ?? [],
            imagePrompt: question.imagePrompt,
            imageUrls: question.imageUrls ?? [],
            sortOrder: questionIndex,
          }),
        ),
      );
    }

    const current = await this.getById(id);
    const shouldComplete =
      current?.notebookStatus === "COMPLETED" && current?.flashcardsStatus === "COMPLETED";
    await pocketbase.collection("documents").update(id, {
      quizzesStatus: "COMPLETED",
      quizzesError: null,
      status: shouldComplete ? "COMPLETED" : "PROCESSING",
      error: null,
    });
  }

  public async markStageFailed(
    id: string,
    stage: "notebook" | "flashcards" | "quizzes",
    errorMessage: string,
  ): Promise<void> {
    const data =
      stage === "notebook"
        ? {
            notebookStatus: "FAILED",
            notebookError: errorMessage,
          }
        : stage === "flashcards"
          ? {
              flashcardsStatus: "FAILED",
              flashcardsError: errorMessage,
            }
          : {
              quizzesStatus: "FAILED",
              quizzesError: errorMessage,
            };
    await pocketbase.collection("documents").update(id, {
      ...data,
      status: "FAILED",
      error: errorMessage,
    });
  }

  private async getNotesRows(documentId: string): Promise<PBNote[]> {
    const rows = (await pocketbase.collection("notes").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        title: toStringOrNull(item.title) ?? "",
        content: toStringOrNull(item.content) ?? "",
        sortOrder: toNumberOrNull(item.sortOrder) ?? 0,
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async getFlashcardDeckRows(documentId: string): Promise<PBFlashcardDeck[]> {
    const rows = (await pocketbase.collection("flashcard_decks").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        title: toStringOrNull(item.title) ?? "",
        description: toStringOrNull(item.description),
        sortOrder: toNumberOrNull(item.sortOrder) ?? 0,
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async getFlashcardRows(documentId: string): Promise<PBFlashcard[]> {
    const rows = (await pocketbase.collection("flashcards").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        deckId: toStringOrNull(item.deck) ?? "",
        front: toStringOrNull(item.front) ?? "",
        back: toStringOrNull(item.back) ?? "",
        imagePrompt: toStringOrNull(item.imagePrompt) ?? "",
        imageUrls: toStringArray(item.imageUrls),
        tags: toStringArray(item.tags),
        sortOrder: toNumberOrNull(item.sortOrder) ?? 0,
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async getQuizRows(documentId: string): Promise<PBQuiz[]> {
    const rows = (await pocketbase.collection("quizzes").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        title: toStringOrNull(item.title) ?? "",
        description: toStringOrNull(item.description),
        sortOrder: toNumberOrNull(item.sortOrder) ?? 0,
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async getQuizQuestionRows(documentId: string): Promise<PBQuizQuestion[]> {
    const rows = (await pocketbase.collection("quiz_questions").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows.map((item) => ({
        id: item.id,
        quizId: toStringOrNull(item.quiz) ?? "",
        question: toStringOrNull(item.question) ?? "",
        options: toStringArray(item.options),
        correctIndex: toNumberOrNull(item.correctIndex) ?? 0,
        explanation: toStringOrNull(item.explanation),
        tags: toStringArray(item.tags),
        imagePrompt: toStringOrNull(item.imagePrompt) ?? "",
        imageUrls: toStringArray(item.imageUrls),
        sortOrder: toNumberOrNull(item.sortOrder) ?? 0,
        createdAt: toStringOrNull(item.created) ?? "",
      })),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async mapFlashcardDecksView(documentId: string) {
    const [decks, cards] = await Promise.all([
      this.getFlashcardDeckRows(documentId),
      this.getFlashcardRows(documentId),
    ]);

    const cardsByDeck = new Map<string, PBFlashcard[]>();
    for (const card of cards) {
      const list = cardsByDeck.get(card.deckId) ?? [];
      list.push(card);
      cardsByDeck.set(card.deckId, list);
    }

    return decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      description: deck.description ?? undefined,
      cards: (cardsByDeck.get(deck.id) ?? []).map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        imageUrls: card.imageUrls.length > 0 ? card.imageUrls : undefined,
        tags: card.tags.length > 0 ? card.tags : undefined,
      })),
    }));
  }

  private async mapQuizzesView(documentId: string) {
    const [quizzes, questions] = await Promise.all([
      this.getQuizRows(documentId),
      this.getQuizQuestionRows(documentId),
    ]);

    const questionsByQuiz = new Map<string, PBQuizQuestion[]>();
    for (const question of questions) {
      const list = questionsByQuiz.get(question.quizId) ?? [];
      list.push(question);
      questionsByQuiz.set(question.quizId, list);
    }

    return quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description ?? undefined,
      questions: (questionsByQuiz.get(quiz.id) ?? []).map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        explanation: question.explanation ?? undefined,
        tags: question.tags.length > 0 ? question.tags : undefined,
        imageUrls: question.imageUrls.length > 0 ? question.imageUrls : undefined,
      })),
    }));
  }

  public async getDocumentStatus(id: string, userId: string): Promise<DocumentStatusView | null> {
    const doc = await this.getById(id, userId);
    if (!doc) {
      return null;
    }

    const notes = await this.getNotesRows(id);
    const [flashcardDecks, quizzes] = await Promise.all([
      doc.flashcardsStatus === "COMPLETED" ? this.mapFlashcardDecksView(id) : Promise.resolve(undefined),
      doc.quizzesStatus === "COMPLETED" ? this.mapQuizzesView(id) : Promise.resolve(undefined),
    ]);

    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      notes:
        doc.notebookStatus === "COMPLETED"
          ? notes.map((item) => ({ id: item.id, title: item.title, content: item.content }))
          : undefined,
      flashcardDecks,
      quizzes,
    };
  }

  public async getDocumentFlashcards(id: string, userId: string): Promise<DocumentFlashcardsView | null> {
    const doc = await this.getById(id, userId);
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
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      flashcardDecks: doc.flashcardsStatus === "COMPLETED" ? await this.mapFlashcardDecksView(id) : undefined,
    };
  }

  public async getDocumentQuizzes(id: string, userId: string): Promise<DocumentQuizzesView | null> {
    const doc = await this.getById(id, userId);
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
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      quizzes: doc.quizzesStatus === "COMPLETED" ? await this.mapQuizzesView(id) : undefined,
    };
  }

  public async getDocumentNotes(id: string, userId: string): Promise<DocumentNotesView | null> {
    const doc = await this.getById(id, userId);
    if (!doc) {
      return null;
    }
    const notes = await this.getNotesRows(id);
    return {
      documentId: doc.id,
      status: doc.status,
      error: doc.error ?? undefined,
      notebookStatus: doc.notebookStatus,
      notebookError: doc.notebookError ?? undefined,
      flashcardsStatus: doc.flashcardsStatus,
      flashcardsError: doc.flashcardsError ?? undefined,
      quizzesStatus: doc.quizzesStatus,
      quizzesError: doc.quizzesError ?? undefined,
      notes:
        doc.notebookStatus === "COMPLETED"
          ? notes.map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
            }))
          : undefined,
    };
  }

  public async getNotesForProcessing(documentId: string): Promise<Array<{ title: string; content: string }>> {
    const notes = await this.getNotesRows(documentId);
    return notes.map((item) => ({ title: item.title, content: item.content }));
  }

  public async getDocumentsByUserId(
    userId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DocumentListItemView[]> {
    const filter = options?.includeDeleted
      ? `owner="${escapeFilter(userId)}"`
      : `owner="${escapeFilter(userId)}" && deletedAt=""`;
    const rows = (await pocketbase.collection("documents").getFullList({
      filter,
    })) as PBRecord[];
    return byCreatedDesc(
      rows.map((item) => ({
        documentId: item.id,
        fileName: toStringOrNull(item.fileName) ?? "",
        mimeType: toStringOrNull(item.mimeType) ?? "",
        fileSize: toNumberOrNull(item.fileSize) ?? 0,
        status: toDocStatus(item.status),
        deletedAt: toDate(item.deletedAt)?.toISOString(),
        createdAt: toStringOrNull(item.created) ?? new Date().toISOString(),
        updatedAt: toStringOrNull(item.updated) ?? new Date().toISOString(),
      })),
    );
  }

  public async getExpiredTrashDocuments(
    cutoff: Date,
    limit: number,
  ): Promise<Array<{ id: string; fileKey: string }>> {
    const rows = (await pocketbase.collection("documents").getFullList({
      filter: `deletedAt!=""`,
    })) as PBRecord[];
    return byCreatedAsc(
      rows
        .map((item) => ({
          id: item.id,
          fileKey: toStringOrNull(item.storageFileId) ?? "",
          deletedAt: toDate(item.deletedAt),
          createdAt: toStringOrNull(item.updated) ?? "",
        }))
        .filter((item) => item.deletedAt && item.deletedAt <= cutoff)
        .slice(0, limit),
    ).map((item) => ({ id: item.id, fileKey: item.fileKey }));
  }

  public async softDeleteById(id: string, userId: string): Promise<void> {
    const doc = await this.getById(id, userId);
    if (!doc) {
      return;
    }
    await pocketbase.collection("documents").update(id, {
      deletedAt: new Date().toISOString(),
    });
  }

  public async restoreById(id: string, userId: string): Promise<void> {
    const doc = await this.getById(id, userId);
    if (!doc) {
      return;
    }
    await pocketbase.collection("documents").update(id, {
      deletedAt: "",
    });
  }

  public async deleteById(id: string, userId?: string): Promise<void> {
    const doc = await this.getById(id, userId);
    if (!doc) {
      return;
    }
    await pocketbase.collection("documents").delete(id);
  }

  private async deleteFlashcardsArtifacts(documentId: string): Promise<void> {
    const [cards, decks] = await Promise.all([
      pocketbase.collection("flashcards").getFullList({
        filter: `document="${escapeFilter(documentId)}"`,
      }) as Promise<PBRecord[]>,
      pocketbase.collection("flashcard_decks").getFullList({
        filter: `document="${escapeFilter(documentId)}"`,
      }) as Promise<PBRecord[]>,
    ]);

    await Promise.all([
      ...cards.map((item) => pocketbase.collection("flashcards").delete(item.id)),
      ...decks.map((item) => pocketbase.collection("flashcard_decks").delete(item.id)),
    ]);
  }

  private async deleteQuizzesArtifacts(documentId: string): Promise<void> {
    const [questions, quizzes] = await Promise.all([
      pocketbase.collection("quiz_questions").getFullList({
        filter: `document="${escapeFilter(documentId)}"`,
      }) as Promise<PBRecord[]>,
      pocketbase.collection("quizzes").getFullList({
        filter: `document="${escapeFilter(documentId)}"`,
      }) as Promise<PBRecord[]>,
    ]);

    await Promise.all([
      ...questions.map((item) => pocketbase.collection("quiz_questions").delete(item.id)),
      ...quizzes.map((item) => pocketbase.collection("quizzes").delete(item.id)),
    ]);
  }

  private async deleteAllArtifacts(documentId: string): Promise<void> {
    const notes = (await pocketbase.collection("notes").getFullList({
      filter: `document="${escapeFilter(documentId)}"`,
    })) as PBRecord[];
    await Promise.all(notes.map((item) => pocketbase.collection("notes").delete(item.id)));
    await Promise.all([this.deleteFlashcardsArtifacts(documentId), this.deleteQuizzesArtifacts(documentId)]);
  }
}
