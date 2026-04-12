import type { PocketBaseDocumentStatus } from "../types/pocketbase";
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

export interface IDocumentRepository {
  createDocument(input: DocumentRegistrationInput): Promise<{ id: string }>;
  getById(id: string, userId?: string): Promise<{
    id: string;
    userId: string;
    fileKey: string;
    fileName: string;
    mimeType: string;
    status: PocketBaseDocumentStatus;
    error: string | null;
    notebookStatus: ArtifactStageStatus;
    notebookError: string | null;
    flashcardsStatus: ArtifactStageStatus;
    flashcardsError: string | null;
    quizzesStatus: ArtifactStageStatus;
    quizzesError: string | null;
    deletedAt: Date | null;
  } | null>;
  markStageProcessing(id: string, stage: "notebook" | "flashcards" | "quizzes"): Promise<void>;
  saveNotebookArtifacts(id: string, notes: LearningArtifactInput["notes"]): Promise<void>;
  saveFlashcardDecksArtifacts(id: string, flashcardDecks: LearningArtifactInput["flashcardDecks"]): Promise<void>;
  saveQuizzesArtifacts(id: string, quizzes: LearningArtifactInput["quizzes"]): Promise<void>;
  getFlashcardsForImageGeneration(documentId: string): Promise<Array<{ id: string; imagePrompt: string }>>;
  updateFlashcardImageUrls(documentId: string, flashcardId: string, imageUrls: string[]): Promise<void>;
  markFlashcardsGenerationCompleted(id: string): Promise<void>;
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
  getDocumentsByUserId(userId: string, options?: { includeDeleted?: boolean }): Promise<DocumentListItemView[]>;
  getExpiredTrashDocuments(cutoff: Date, limit: number): Promise<Array<{ id: string; fileKey: string }>>;
  softDeleteById(id: string, userId: string): Promise<void>;
  restoreById(id: string, userId: string): Promise<void>;
  deleteById(id: string, userId?: string): Promise<void>;
}
