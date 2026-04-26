import type { PocketBaseRowStatus } from "./pocketbase";

export interface FlashcardCard {
  id: string;
  front: string;
  back: string;
  imagePrompt: string;
  imageUrls?: string[];
  tags?: string[];
}

export interface FlashcardsContent {
  cards: FlashcardCard[];
}

export interface FlashcardsRow {
  id: string;
  ownerId: string;
  docs: string[];
  title: string;
  description: string | null;
  content: FlashcardsContent;
  status: PocketBaseRowStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardsListItemView {
  id: string;
  title: string;
  description?: string;
  status: PocketBaseRowStatus;
  error?: string;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardsDetailView extends FlashcardsListItemView {
  cards: Array<{
    id: string;
    front: string;
    back: string;
    imageUrls?: string[];
    tags?: string[];
  }>;
}

export interface FlashcardsStatusView {
  id: string;
  status: PocketBaseRowStatus;
  error?: string;
}

export interface CreateFlashcardsInput {
  ownerId: string;
  docs: string[];
  title: string;
}
