import type { PocketBaseRowStatus } from "./pocketbase";

export interface NotesRow {
  id: string;
  ownerId: string;
  docs: string[];
  title: string;
  description: string | null;
  /** Raw Markdown body. Stored as-is in the `content` column. */
  content: string;
  status: PocketBaseRowStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotesListItemView {
  id: string;
  title: string;
  description?: string;
  status: PocketBaseRowStatus;
  error?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotesDetailView extends NotesListItemView {
  markdown: string;
}

export interface NotesStatusView {
  id: string;
  status: PocketBaseRowStatus;
  error?: string;
}

export interface CreateNotesInput {
  ownerId: string;
  docs: string[];
  title: string;
}
