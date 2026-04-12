import type { DocumentStatus, DocumentType } from "@prisma/client";

export type FlashcardImageStatus = "not_requested" | "queued" | "processing" | "ready" | "failed";
export type ArtifactStageStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DocumentRegistrationInput {
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  fileUrl: string;
  selectedStartPage?: number;
  selectedEndPage?: number;
  selectedPages?: number[];
  type: DocumentType;
}

export interface LearningArtifactInput {
  notes: Array<{ title: string; content: string }>;
  flashcards: Array<{
    question: string;
    answer: string;
    topic?: string;
    iconKey?: string;
    visualNeedScore?: number;
    imagePrompt?: string;
    imageStatus?: FlashcardImageStatus;
    imageUrl?: string;
    requiresPointer?: boolean;
    pointerX?: number;
    pointerY?: number;
  }>;
  quizzes: Array<{
    question: string;
    options: string[];
    correctOption: number;
    explanation?: string;
  }>;
}

export interface DocumentStatusView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notebookStatus: ArtifactStageStatus;
  notebookError?: string;
  flashcardsStatus: ArtifactStageStatus;
  flashcardsError?: string;
  flashcardsEnrichmentStatus: ArtifactStageStatus;
  flashcardsEnrichmentError?: string;
  quizzesStatus: ArtifactStageStatus;
  quizzesError?: string;
  notes?: Array<{ id: string; title: string; content: string }>;
  flashcards?: Array<{
    id: string;
    question: string;
    answer: string;
    topic?: string;
    iconKey?: string;
    visualNeedScore?: number;
    imagePrompt?: string;
    imageStatus?: FlashcardImageStatus;
    imageUrl?: string;
    requiresPointer?: boolean;
    pointerX?: number;
    pointerY?: number;
  }>;
  quizzes?: Array<{
    id: string;
    question: string;
    options: string[];
    correctOption: number;
    explanation?: string;
  }>;
}

export interface DocumentListItemView {
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFlashcardsView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notebookStatus: ArtifactStageStatus;
  notebookError?: string;
  flashcardsStatus: ArtifactStageStatus;
  flashcardsError?: string;
  flashcardsEnrichmentStatus: ArtifactStageStatus;
  flashcardsEnrichmentError?: string;
  quizzesStatus: ArtifactStageStatus;
  quizzesError?: string;
  flashcards?: Array<{
    id: string;
    question: string;
    answer: string;
    topic?: string;
    iconKey?: string;
    visualNeedScore?: number;
    imagePrompt?: string;
    imageStatus?: FlashcardImageStatus;
    imageUrl?: string;
    requiresPointer?: boolean;
    pointerX?: number;
    pointerY?: number;
  }>;
}

export interface DocumentQuizzesView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notebookStatus: ArtifactStageStatus;
  notebookError?: string;
  flashcardsStatus: ArtifactStageStatus;
  flashcardsError?: string;
  flashcardsEnrichmentStatus: ArtifactStageStatus;
  flashcardsEnrichmentError?: string;
  quizzesStatus: ArtifactStageStatus;
  quizzesError?: string;
  quizzes?: Array<{
    id: string;
    question: string;
    options: string[];
    correctOption: number;
    explanation?: string;
  }>;
}

export interface DocumentNotesView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notebookStatus: ArtifactStageStatus;
  notebookError?: string;
  flashcardsStatus: ArtifactStageStatus;
  flashcardsError?: string;
  flashcardsEnrichmentStatus: ArtifactStageStatus;
  flashcardsEnrichmentError?: string;
  quizzesStatus: ArtifactStageStatus;
  quizzesError?: string;
  notes?: Array<{ id: string; title: string; content: string }>;
}

export interface FlashcardImageRequestResult {
  documentId: string;
  flashcard: {
    id: string;
    imageStatus?: FlashcardImageStatus;
    imageUrl?: string;
    imagePrompt?: string;
    visualNeedScore?: number;
  };
}
