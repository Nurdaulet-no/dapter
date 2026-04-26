import type { PocketBaseRowStatus } from "./pocketbase";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
  tags?: string[];
  imagePrompt: string;
  imageUrls?: string[];
}

export interface QuizContent {
  questions: QuizQuestion[];
}

export interface QuizRow {
  id: string;
  ownerId: string;
  docs: string[];
  title: string;
  description: string | null;
  content: QuizContent;
  status: PocketBaseRowStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizListItemView {
  id: string;
  title: string;
  description?: string;
  status: PocketBaseRowStatus;
  error?: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizDetailView extends QuizListItemView {
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
    tags?: string[];
    imageUrls?: string[];
  }>;
}

export interface QuizStatusView {
  id: string;
  status: PocketBaseRowStatus;
  error?: string;
}

export interface CreateQuizInput {
  ownerId: string;
  docs: string[];
  title: string;
}
