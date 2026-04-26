import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { INotesRepository } from "../repositories/notes.repository";
import type {
  CreateNotesInput,
  NotesDetailView,
  NotesListItemView,
  NotesStatusView,
} from "../types/notes";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";
import {
  buildProvisionalTitle,
  extractCombinedText,
  runWithStageTimeout,
} from "./pipeline-helpers";

/**
 * Some xAI models emit Markdown with `<br>` HTML tags instead of real
 * newlines, which breaks downstream parsing (the whole document collapses
 * into a single H1 line). Normalize on save so storage holds clean Markdown.
 */
const normalizeMarkdown = (raw: string): string =>
  raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export interface UploadNotesInput {
  ownerId: string;
  files: Array<{ fileName: string; mimeType: string; bytes: Uint8Array }>;
}

export interface INotesService {
  createAndQueue(input: UploadNotesInput): Promise<{ id: string; status: "PROCESSING" }>;
  list(ownerId: string): Promise<NotesListItemView[]>;
  getDetail(id: string, ownerId: string): Promise<NotesDetailView>;
  getStatus(id: string, ownerId: string): Promise<NotesStatusView>;
  retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class NotesService implements INotesService {
  public constructor(
    private readonly repository: INotesRepository,
    private readonly storageService: IStorageService,
    private readonly extractionService: IExtractionService,
    private readonly aiService: IAIService,
  ) {}

  public async createAndQueue(
    input: UploadNotesInput,
  ): Promise<{ id: string; status: "PROCESSING" }> {
    const fileNames = input.files.map((file) => file.fileName);
    logger.info("notes.upload_and_queue.started", {
      fileCount: input.files.length,
      fileNames,
    });

    const docs: string[] = [];
    const sources: Array<{ fileKey: string; fileName: string; mimeType: string }> = [];
    for (const file of input.files) {
      const uploaded = await this.storageService.upload({
        fileName: file.fileName,
        mimeType: file.mimeType,
        body: file.bytes,
      });
      docs.push(uploaded.fileKey);
      sources.push({
        fileKey: uploaded.fileKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
      });
    }

    const title = buildProvisionalTitle(fileNames);
    const create: CreateNotesInput = {
      ownerId: input.ownerId,
      docs,
      title,
    };
    const created = await this.repository.create(create);
    logger.info("notes.row.created", { id: created.id, docs });

    void this.runPipeline(created.id, sources).catch((error) => {
      logger.error("notes.pipeline.unhandled", {
        id: created.id,
        message: error instanceof Error ? error.message : "Unknown pipeline error",
      });
    });

    return { id: created.id, status: "PROCESSING" };
  }

  public async list(ownerId: string): Promise<NotesListItemView[]> {
    return this.repository.listByOwner(ownerId);
  }

  public async getDetail(id: string, ownerId: string): Promise<NotesDetailView> {
    const view = await this.repository.getDetailView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "NOTES_NOT_FOUND", "Notes not found");
  }

  public async getStatus(id: string, ownerId: string): Promise<NotesStatusView> {
    const view = await this.repository.getStatusView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "NOTES_NOT_FOUND", "Notes not found");
  }

  public async retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }> {
    const row = await this.repository.getById(id, ownerId);
    if (!row) {
      await this.assertOwnershipOrThrow(id, ownerId);
      throw new AppError(404, "NOTES_NOT_FOUND", "Notes not found");
    }
    await this.repository.markProcessing(id);
    const sources = await this.resolveSources(row.docs);
    void this.runPipeline(id, sources).catch((error) => {
      logger.error("notes.pipeline.retry.unhandled", {
        id,
        message: error instanceof Error ? error.message : "Unknown retry error",
      });
    });
    return { id, status: "PROCESSING" };
  }

  public async delete(id: string, ownerId: string): Promise<void> {
    const row = await this.repository.getById(id, ownerId);
    if (!row) {
      await this.assertOwnershipOrThrow(id, ownerId);
      throw new AppError(404, "NOTES_NOT_FOUND", "Notes not found");
    }
    await this.repository.delete(id, ownerId);
  }

  private async assertOwnershipOrThrow(id: string, ownerId: string): Promise<void> {
    const owned = await this.repository.getById(id, ownerId);
    if (owned) return;
    const exists = await this.repository.getById(id);
    if (exists) throw new AppError(403, "NOTES_FORBIDDEN", "Forbidden");
    throw new AppError(404, "NOTES_NOT_FOUND", "Notes not found");
  }

  private async resolveSources(
    docs: string[],
  ): Promise<Array<{ fileKey: string; fileName: string; mimeType: string }>> {
    const { pocketbase } = await import("../config/pocketbase");
    const sources: Array<{ fileKey: string; fileName: string; mimeType: string }> = [];
    for (const fileKey of docs) {
      const record = (await pocketbase
        .collection("storage_files")
        .getOne(fileKey)
        .catch(() => null)) as
        | { id: string; fileName?: string; mimeType?: string }
        | null;
      if (!record) continue;
      sources.push({
        fileKey: record.id,
        fileName: typeof record.fileName === "string" ? record.fileName : "",
        mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
      });
    }
    return sources;
  }

  private async runPipeline(
    id: string,
    sources: Array<{ fileKey: string; fileName: string; mimeType: string }>,
  ): Promise<void> {
    try {
      const text = await extractCombinedText({
        storageService: this.storageService,
        extractionService: this.extractionService,
        sources,
      });
      const payload = await runWithStageTimeout("notes", id, () =>
        this.aiService.generateNotes(text),
      );

      const markdown = normalizeMarkdown(payload.markdown);

      await this.repository.saveCompletedContent(id, {
        title: payload.title,
        description: payload.description ?? null,
        markdown,
      });
      logger.info("notes.pipeline.completed", {
        id,
        markdownLength: payload.markdown.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notes pipeline failed";
      logger.error("notes.pipeline.failed", { id, message, error });
      await this.repository.markFailed(id, message).catch(() => {});
    }
  }
}
