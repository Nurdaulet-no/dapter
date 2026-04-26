import { pocketbase } from "../config/pocketbase";
import type {
  CreateNotesInput,
  NotesDetailView,
  NotesListItemView,
  NotesRow,
  NotesStatusView,
} from "../types/notes";
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

const wordCount = (markdown: string): number =>
  markdown.trim().length === 0 ? 0 : markdown.trim().split(/\s+/).length;

const recordToRow = (record: PBRecord): NotesRow => ({
  id: record.id,
  ownerId: toStringOrNull(record.owner) ?? "",
  docs: toStringArray(record.docs),
  title: toStringOrNull(record.title) ?? "",
  description: toStringOrNull(record.description),
  content: typeof record.content === "string" ? record.content : "",
  status: toStatus(record.status),
  error: toStringOrNull(record.error),
  createdAt: toStringOrNull(record.created) ?? new Date().toISOString(),
  updatedAt: toStringOrNull(record.updated) ?? new Date().toISOString(),
});

const toListItemView = (row: NotesRow): NotesListItemView => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  status: row.status,
  error: row.error ?? undefined,
  wordCount: wordCount(row.content),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toDetailView = (row: NotesRow): NotesDetailView => ({
  ...toListItemView(row),
  markdown: row.content,
});

export interface INotesRepository {
  create(input: CreateNotesInput): Promise<{ id: string }>;
  getById(id: string, ownerId?: string): Promise<NotesRow | null>;
  listByOwner(ownerId: string): Promise<NotesListItemView[]>;
  getDetailView(id: string, ownerId: string): Promise<NotesDetailView | null>;
  getStatusView(id: string, ownerId: string): Promise<NotesStatusView | null>;
  saveCompletedContent(
    id: string,
    input: { title: string; description: string | null; markdown: string },
  ): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  markProcessing(id: string): Promise<void>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class PocketBaseNotesRepository implements INotesRepository {
  public async create(input: CreateNotesInput): Promise<{ id: string }> {
    const created = (await pocketbase.collection("notes").create({
      owner: input.ownerId,
      docs: input.docs,
      title: input.title,
      description: null,
      content: "",
      status: "PROCESSING",
    })) as PBRecord;
    return { id: created.id };
  }

  public async getById(id: string, ownerId?: string): Promise<NotesRow | null> {
    const record = (await pocketbase
      .collection("notes")
      .getOne(id)
      .catch(() => null)) as PBRecord | null;
    if (!record) return null;
    const row = recordToRow(record);
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  }

  public async listByOwner(ownerId: string): Promise<NotesListItemView[]> {
    const rows = (await pocketbase.collection("notes").getFullList({
      filter: `owner="${escapeFilter(ownerId)}"`,
    })) as PBRecord[];
    return rows
      .map(recordToRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toListItemView);
  }

  public async getDetailView(id: string, ownerId: string): Promise<NotesDetailView | null> {
    const row = await this.getById(id, ownerId);
    if (!row) return null;
    return toDetailView(row);
  }

  public async getStatusView(id: string, ownerId: string): Promise<NotesStatusView | null> {
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
    input: { title: string; description: string | null; markdown: string },
  ): Promise<void> {
    await pocketbase.collection("notes").update(id, {
      title: input.title,
      description: input.description,
      content: input.markdown,
      status: "COMPLETED",
      error: null,
    });
  }

  public async markFailed(id: string, errorMessage: string): Promise<void> {
    await pocketbase.collection("notes").update(id, {
      status: "FAILED",
      error: errorMessage,
    });
  }

  public async markProcessing(id: string): Promise<void> {
    await pocketbase.collection("notes").update(id, {
      status: "PROCESSING",
      error: null,
    });
  }

  public async delete(id: string, ownerId: string): Promise<void> {
    const row = await this.getById(id, ownerId);
    if (!row) return;
    await pocketbase.collection("notes").delete(id);
  }
}
