import type { DocumentStatus, DocumentType } from "@prisma/client";

export interface DocumentRegistrationInput {
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  fileUrl: string;
  type: DocumentType;
}

export interface LearningArtifactInput {
  notes: Array<{ title: string; content: string }>;
  flashcards: Array<{ question: string; answer: string }>;
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
  notes?: Array<{ id: string; title: string; content: string }>;
  flashcards?: Array<{ id: string; question: string; answer: string }>;
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
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFlashcardsView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  flashcards?: Array<{ id: string; question: string; answer: string }>;
}

export interface DocumentQuizzesView {
  documentId: string;
  status: DocumentStatus;
  error?: string;
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
  notes?: Array<{ id: string; title: string; content: string }>;
}
