import { pocketbase } from "../config/pocketbase";
import type {
  CreateFlashcardsInput,
  FlashcardCard,
  FlashcardsContent,
  FlashcardsDetailView,
  FlashcardsListItemView,
  FlashcardsRow,
  FlashcardsStatusView,
} from "../types/flashcards";
import type { PocketBaseRowStatus } from "../types/pocketbase";

interface PBRecord {
  id: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

const toStatus = (value: unknown): PocketBaseRowStatus =>
  value === "COMPLETED" || value === "FAILED" ? value : "PROCESSING";

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const escapeFilter = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const parseContent = (raw: unknown): FlashcardsContent => {
  if (!raw) return { cards: [] };
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { cards: [] };
    }
  }
  if (typeof value !== "object" || value === null) return { cards: [] };
  const maybeCards = (value as { cards?: unknown }).cards;
  if (!Array.isArray(maybeCards)) return { cards: [] };
  const cards: FlashcardCard[] = [];
  for (const item of maybeCards) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.front !== "string" || typeof c.back !== "string") {
      continue;
    }
    cards.push({
      id: c.id,
      front: c.front,
      back: c.back,
      imagePrompt: typeof c.imagePrompt === "string" ? c.imagePrompt : "",
      imageUrls: Array.isArray(c.imageUrls) ? toStringArray(c.imageUrls) : undefined,
      tags: Array.isArray(c.tags) ? toStringArray(c.tags) : undefined,
    });
  }
  return { cards };
};

const recordToRow = (record: PBRecord): FlashcardsRow => ({
  id: record.id,
  ownerId: toStringOrNull(record.owner) ?? "",
  docs: toStringArray(record.docs),
  title: toStringOrNull(record.title) ?? "",
  description: toStringOrNull(record.description),
  content: parseContent(record.content),
  status: toStatus(record.status),
  error: toStringOrNull(record.error),
  createdAt: toStringOrNull(record.created) ?? new Date().toISOString(),
  updatedAt: toStringOrNull(record.updated) ?? new Date().toISOString(),
});

const toListItemView = (row: FlashcardsRow): FlashcardsListItemView => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  status: row.status,
  error: row.error ?? undefined,
  cardCount: row.content.cards.length,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toDetailView = (row: FlashcardsRow): FlashcardsDetailView => ({
  ...toListItemView(row),
  cards: row.content.cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    imageUrls: card.imageUrls && card.imageUrls.length > 0 ? card.imageUrls : undefined,
    tags: card.tags && card.tags.length > 0 ? card.tags : undefined,
  })),
});

export interface IFlashcardsRepository {
  create(input: CreateFlashcardsInput): Promise<{ id: string }>;
  getById(id: string, ownerId?: string): Promise<FlashcardsRow | null>;
  listByOwner(ownerId: string): Promise<FlashcardsListItemView[]>;
  getDetailView(id: string, ownerId: string): Promise<FlashcardsDetailView | null>;
  getStatusView(id: string, ownerId: string): Promise<FlashcardsStatusView | null>;
  saveCompletedContent(
    id: string,
    input: { title: string; description: string | null; cards: FlashcardCard[] },
  ): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  markProcessing(id: string): Promise<void>;
  updateCardImageUrls(id: string, cardId: string, imageUrls: string[]): Promise<void>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class PocketBaseFlashcardsRepository implements IFlashcardsRepository {
  /**
   * Per-row mutex. Image-gen workers concurrently update individual cards'
   * `imageUrls` inside the JSON `content` blob; without serialization, last
   * write would clobber earlier ones.
   */
  private readonly rowLocks = new Map<string, Promise<void>>();

  public async create(input: CreateFlashcardsInput): Promise<{ id: string }> {
    const created = (await pocketbase.collection("flashcards").create({
      owner: input.ownerId,
      docs: input.docs,
      title: input.title,
      description: null,
      content: { cards: [] } satisfies FlashcardsContent,
      status: "PROCESSING",
    })) as PBRecord;
    return { id: created.id };
  }

  public async getById(id: string, ownerId?: string): Promise<FlashcardsRow | null> {
    const record = (await pocketbase
      .collection("flashcards")
      .getOne(id)
      .catch(() => null)) as PBRecord | null;
    if (!record) return null;
    const row = recordToRow(record);
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  }

  public async listByOwner(ownerId: string): Promise<FlashcardsListItemView[]> {
    const rows = (await pocketbase.collection("flashcards").getFullList({
      filter: `owner="${escapeFilter(ownerId)}"`,
    })) as PBRecord[];
    return rows
      .map(recordToRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toListItemView);
  }

  public async getDetailView(id: string, ownerId: string): Promise<FlashcardsDetailView | null> {
    const row = await this.getById(id, ownerId);
    if (!row) return null;
    return toDetailView(row);
  }

  public async getStatusView(id: string, ownerId: string): Promise<FlashcardsStatusView | null> {
    const row = await this.getById(id, ownerId);
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      error: row.error ?? undefined,
    };
  }

  public async saveCompletedContent(
    id: string,
    input: { title: string; description: string | null; cards: FlashcardCard[] },
  ): Promise<void> {
    await this.withRowLock(id, async () => {
      await pocketbase.collection("flashcards").update(id, {
        title: input.title,
        description: input.description,
        content: { cards: input.cards } satisfies FlashcardsContent,
        status: "COMPLETED",
        error: null,
      });
    });
  }

  public async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.withRowLock(id, async () => {
      await pocketbase.collection("flashcards").update(id, {
        status: "FAILED",
        error: errorMessage,
      });
    });
  }

  public async markProcessing(id: string): Promise<void> {
    await this.withRowLock(id, async () => {
      await pocketbase.collection("flashcards").update(id, {
        status: "PROCESSING",
        error: null,
      });
    });
  }

  public async updateCardImageUrls(id: string, cardId: string, imageUrls: string[]): Promise<void> {
    await this.withRowLock(id, async () => {
      const row = await this.getById(id);
      if (!row) return;
      const cards = row.content.cards.map((card) =>
        card.id === cardId ? { ...card, imageUrls } : card,
      );
      await pocketbase.collection("flashcards").update(id, {
        content: { cards } satisfies FlashcardsContent,
      });
    });
  }

  public async delete(id: string, ownerId: string): Promise<void> {
    const row = await this.getById(id, ownerId);
    if (!row) return;
    await pocketbase.collection("flashcards").delete(id);
  }

  private async withRowLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.rowLocks.get(id) ?? Promise.resolve();
    let resolveNext: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    const chained = previous.then(() => next);
    this.rowLocks.set(id, chained);

    try {
      await previous;
      return await action();
    } finally {
      resolveNext();
      if (this.rowLocks.get(id) === chained) {
        this.rowLocks.delete(id);
      }
    }
  }
}
