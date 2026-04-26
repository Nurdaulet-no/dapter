import { pocketbase } from "../config/pocketbase";
import type {
  CreateQuizInput,
  QuizContent,
  QuizDetailView,
  QuizListItemView,
  QuizQuestion,
  QuizRow,
  QuizStatusView,
} from "../types/quizzes";
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

const toNumberOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const escapeFilter = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const parseContent = (raw: unknown): QuizContent => {
  if (!raw) return { questions: [] };
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { questions: [] };
    }
  }
  if (typeof value !== "object" || value === null) return { questions: [] };
  const maybeQuestions = (value as { questions?: unknown }).questions;
  if (!Array.isArray(maybeQuestions)) return { questions: [] };
  const questions: QuizQuestion[] = [];
  for (const item of maybeQuestions) {
    if (typeof item !== "object" || item === null) continue;
    const q = item as Record<string, unknown>;
    if (typeof q.id !== "string" || typeof q.question !== "string") continue;
    if (!Array.isArray(q.options)) continue;
    questions.push({
      id: q.id,
      question: q.question,
      options: toStringArray(q.options),
      correctIndex: toNumberOrZero(q.correctIndex),
      explanation: typeof q.explanation === "string" ? q.explanation : null,
      tags: Array.isArray(q.tags) ? toStringArray(q.tags) : undefined,
      imagePrompt: typeof q.imagePrompt === "string" ? q.imagePrompt : "",
      imageUrls: Array.isArray(q.imageUrls) ? toStringArray(q.imageUrls) : undefined,
    });
  }
  return { questions };
};

const recordToRow = (record: PBRecord): QuizRow => ({
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

const toListItemView = (row: QuizRow): QuizListItemView => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  status: row.status,
  error: row.error ?? undefined,
  questionCount: row.content.questions.length,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toDetailView = (row: QuizRow): QuizDetailView => ({
  ...toListItemView(row),
  questions: row.content.questions.map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation ?? undefined,
    tags: question.tags && question.tags.length > 0 ? question.tags : undefined,
    imageUrls: question.imageUrls && question.imageUrls.length > 0 ? question.imageUrls : undefined,
  })),
});

export interface IQuizzesRepository {
  create(input: CreateQuizInput): Promise<{ id: string }>;
  getById(id: string, ownerId?: string): Promise<QuizRow | null>;
  listByOwner(ownerId: string): Promise<QuizListItemView[]>;
  getDetailView(id: string, ownerId: string): Promise<QuizDetailView | null>;
  getStatusView(id: string, ownerId: string): Promise<QuizStatusView | null>;
  saveCompletedContent(
    id: string,
    input: { title: string; description: string | null; questions: QuizQuestion[] },
  ): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  markProcessing(id: string): Promise<void>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class PocketBaseQuizzesRepository implements IQuizzesRepository {
  public async create(input: CreateQuizInput): Promise<{ id: string }> {
    const created = (await pocketbase.collection("quizzes").create({
      owner: input.ownerId,
      docs: input.docs,
      title: input.title,
      description: null,
      content: { questions: [] } satisfies QuizContent,
      status: "PROCESSING",
    })) as PBRecord;
    return { id: created.id };
  }

  public async getById(id: string, ownerId?: string): Promise<QuizRow | null> {
    const record = (await pocketbase
      .collection("quizzes")
      .getOne(id)
      .catch(() => null)) as PBRecord | null;
    if (!record) return null;
    const row = recordToRow(record);
    if (ownerId && row.ownerId !== ownerId) return null;
    return row;
  }

  public async listByOwner(ownerId: string): Promise<QuizListItemView[]> {
    const rows = (await pocketbase.collection("quizzes").getFullList({
      filter: `owner="${escapeFilter(ownerId)}"`,
    })) as PBRecord[];
    return rows
      .map(recordToRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toListItemView);
  }

  public async getDetailView(id: string, ownerId: string): Promise<QuizDetailView | null> {
    const row = await this.getById(id, ownerId);
    if (!row) return null;
    return toDetailView(row);
  }

  public async getStatusView(id: string, ownerId: string): Promise<QuizStatusView | null> {
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
    input: { title: string; description: string | null; questions: QuizQuestion[] },
  ): Promise<void> {
    await pocketbase.collection("quizzes").update(id, {
      title: input.title,
      description: input.description,
      content: { questions: input.questions } satisfies QuizContent,
      status: "COMPLETED",
      error: null,
    });
  }

  public async markFailed(id: string, errorMessage: string): Promise<void> {
    await pocketbase.collection("quizzes").update(id, {
      status: "FAILED",
      error: errorMessage,
    });
  }

  public async markProcessing(id: string): Promise<void> {
    await pocketbase.collection("quizzes").update(id, {
      status: "PROCESSING",
      error: null,
    });
  }

  public async delete(id: string, ownerId: string): Promise<void> {
    const row = await this.getById(id, ownerId);
    if (!row) return;
    await pocketbase.collection("quizzes").delete(id);
  }
}
