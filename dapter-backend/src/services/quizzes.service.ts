import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IQuizzesRepository } from "../repositories/quizzes.repository";
import type {
  CreateQuizInput,
  QuizDetailView,
  QuizListItemView,
  QuizQuestion,
  QuizStatusView,
} from "../types/quizzes";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";
import {
  buildProvisionalTitle,
  extractCombinedText,
  runWithStageTimeout,
} from "./pipeline-helpers";

export interface UploadQuizInput {
  ownerId: string;
  files: Array<{ fileName: string; mimeType: string; bytes: Uint8Array }>;
}

export interface IQuizzesService {
  createAndQueue(input: UploadQuizInput): Promise<{ id: string; status: "PROCESSING" }>;
  list(ownerId: string): Promise<QuizListItemView[]>;
  getDetail(id: string, ownerId: string): Promise<QuizDetailView>;
  getStatus(id: string, ownerId: string): Promise<QuizStatusView>;
  retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class QuizzesService implements IQuizzesService {
  public constructor(
    private readonly repository: IQuizzesRepository,
    private readonly storageService: IStorageService,
    private readonly extractionService: IExtractionService,
    private readonly aiService: IAIService,
  ) {}

  public async createAndQueue(
    input: UploadQuizInput,
  ): Promise<{ id: string; status: "PROCESSING" }> {
    const fileNames = input.files.map((file) => file.fileName);
    logger.info("quizzes.upload_and_queue.started", {
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
    const create: CreateQuizInput = {
      ownerId: input.ownerId,
      docs,
      title,
    };
    const created = await this.repository.create(create);
    logger.info("quizzes.row.created", { id: created.id, docs });

    void this.runPipeline(created.id, sources).catch((error) => {
      logger.error("quizzes.pipeline.unhandled", {
        id: created.id,
        message: error instanceof Error ? error.message : "Unknown pipeline error",
      });
    });

    return { id: created.id, status: "PROCESSING" };
  }

  public async list(ownerId: string): Promise<QuizListItemView[]> {
    return this.repository.listByOwner(ownerId);
  }

  public async getDetail(id: string, ownerId: string): Promise<QuizDetailView> {
    const view = await this.repository.getDetailView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found");
  }

  public async getStatus(id: string, ownerId: string): Promise<QuizStatusView> {
    const view = await this.repository.getStatusView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found");
  }

  public async retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }> {
    const row = await this.repository.getById(id, ownerId);
    if (!row) {
      await this.assertOwnershipOrThrow(id, ownerId);
      throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found");
    }
    await this.repository.markProcessing(id);
    const sources = await this.resolveSources(row.docs);
    void this.runPipeline(id, sources).catch((error) => {
      logger.error("quizzes.pipeline.retry.unhandled", {
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
      throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found");
    }
    await this.repository.delete(id, ownerId);
  }

  private async assertOwnershipOrThrow(id: string, ownerId: string): Promise<void> {
    const owned = await this.repository.getById(id, ownerId);
    if (owned) return;
    const exists = await this.repository.getById(id);
    if (exists) throw new AppError(403, "QUIZ_FORBIDDEN", "Forbidden");
    throw new AppError(404, "QUIZ_NOT_FOUND", "Quiz not found");
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
      const payload = await runWithStageTimeout("quizzes", id, () =>
        this.aiService.generateQuiz(text),
      );

      const questions: QuizQuestion[] = payload.questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        explanation: question.explanation ?? null,
        tags: question.tags ?? undefined,
        imagePrompt: question.imagePrompt,
      }));

      await this.repository.saveCompletedContent(id, {
        title: payload.title,
        description: payload.description ?? null,
        questions,
      });
      logger.info("quizzes.pipeline.completed", {
        id,
        questionCount: questions.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quizzes pipeline failed";
      logger.error("quizzes.pipeline.failed", { id, message, error });
      await this.repository.markFailed(id, message).catch(() => {});
    }
  }
}
