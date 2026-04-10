import type { DocumentStatus, DocumentType } from "@prisma/client";

export interface DocumentRegistrationInput {
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
