import type { PocketBaseDocumentStatus, PocketBaseDocumentType } from "./pocketbase";

export type ArtifactStageStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DocumentRegistrationInput {
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  fileUrl: string;
  type: PocketBaseDocumentType;
}

export interface LearningArtifactInput {
  notes: Array<{ title: string; content: string }>;
  flashcardDecks: Array<{
    id: string;
    title: string;
    description?: string;
    cards: Array<{
      id: string;
      front: string;
      back: string;
      imagePrompt: string;
      imageUrls?: string[];
      tags?: string[];
    }>;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    description?: string;
    questions: Array<{
      id: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
      tags?: string[];
      imagePrompt: string;
      imageUrls?: string[];
    }>;
  }>;
}

export interface DocumentStatusView {
  documentId: string;
  status: PocketBaseDocumentStatus;
  error?: string;
}

export interface DocumentListItemView {
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: PocketBaseDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentNotesView {
  documentId: string;
  status: ArtifactStageStatus;
  error?: string;
  notes: Array<{ id: string; title: string; content: string }>;
}

export interface DocumentFlashcardsView {
  documentId: string;
  status: ArtifactStageStatus;
  error?: string;
  flashcardDecks: Array<{
    id: string;
    title: string;
    description?: string;
    cards: Array<{
      id: string;
      front: string;
      back: string;
      imageUrls?: string[];
      tags?: string[];
    }>;
  }>;
}

export interface DocumentQuizzesView {
  documentId: string;
  status: ArtifactStageStatus;
  error?: string;
  quizzes: Array<{
    id: string;
    title: string;
    description?: string;
    questions: Array<{
      id: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
      tags?: string[];
      imageUrls?: string[];
    }>;
  }>;
}
