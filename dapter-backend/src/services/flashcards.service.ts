import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../errors/app-error";
import type { IFlashcardsRepository } from "../repositories/flashcards.repository";
import type {
  CreateFlashcardsInput,
  FlashcardCard,
  FlashcardsDetailView,
  FlashcardsListItemView,
  FlashcardsStatusView,
} from "../types/flashcards";
import type { IAIService } from "./ai.service";
import type { IExtractionService } from "./extraction.service";
import type { IStorageService } from "./storage.service";
import { createLLMProvider } from "./providers/factory";
import {
  buildProvisionalTitle,
  extractCombinedText,
  runWithStageTimeout,
} from "./pipeline-helpers";

export interface UploadFlashcardsInput {
  ownerId: string;
  files: Array<{ fileName: string; mimeType: string; bytes: Uint8Array }>;
}

export interface IFlashcardsService {
  createAndQueue(input: UploadFlashcardsInput): Promise<{ id: string; status: "PROCESSING" }>;
  list(ownerId: string): Promise<FlashcardsListItemView[]>;
  getDetail(id: string, ownerId: string): Promise<FlashcardsDetailView>;
  getStatus(id: string, ownerId: string): Promise<FlashcardsStatusView>;
  retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }>;
  delete(id: string, ownerId: string): Promise<void>;
}

export class FlashcardsService implements IFlashcardsService {
  private readonly llmProvider = createLLMProvider();

  public constructor(
    private readonly repository: IFlashcardsRepository,
    private readonly storageService: IStorageService,
    private readonly extractionService: IExtractionService,
    private readonly aiService: IAIService,
  ) {}

  public async createAndQueue(
    input: UploadFlashcardsInput,
  ): Promise<{ id: string; status: "PROCESSING" }> {
    const fileNames = input.files.map((file) => file.fileName);
    logger.info("flashcards.upload_and_queue.started", {
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
    const create: CreateFlashcardsInput = {
      ownerId: input.ownerId,
      docs,
      title,
    };
    const created = await this.repository.create(create);
    logger.info("flashcards.row.created", { id: created.id, docs });

    void this.runPipeline(created.id, sources).catch((error) => {
      logger.error("flashcards.pipeline.unhandled", {
        id: created.id,
        message: error instanceof Error ? error.message : "Unknown pipeline error",
      });
    });

    return { id: created.id, status: "PROCESSING" };
  }

  public async list(ownerId: string): Promise<FlashcardsListItemView[]> {
    return this.repository.listByOwner(ownerId);
  }

  public async getDetail(id: string, ownerId: string): Promise<FlashcardsDetailView> {
    const view = await this.repository.getDetailView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "FLASHCARDS_NOT_FOUND", "Flashcards not found");
  }

  public async getStatus(id: string, ownerId: string): Promise<FlashcardsStatusView> {
    const view = await this.repository.getStatusView(id, ownerId);
    if (view) return view;
    await this.assertOwnershipOrThrow(id, ownerId);
    throw new AppError(404, "FLASHCARDS_NOT_FOUND", "Flashcards not found");
  }

  public async retry(id: string, ownerId: string): Promise<{ id: string; status: "PROCESSING" }> {
    const row = await this.repository.getById(id, ownerId);
    if (!row) {
      await this.assertOwnershipOrThrow(id, ownerId);
      throw new AppError(404, "FLASHCARDS_NOT_FOUND", "Flashcards not found");
    }
    await this.repository.markProcessing(id);
    const sources = await this.resolveSources(row.docs);
    void this.runPipeline(id, sources).catch((error) => {
      logger.error("flashcards.pipeline.retry.unhandled", {
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
      throw new AppError(404, "FLASHCARDS_NOT_FOUND", "Flashcards not found");
    }
    await this.repository.delete(id, ownerId);
  }

  private async assertOwnershipOrThrow(id: string, ownerId: string): Promise<void> {
    const owned = await this.repository.getById(id, ownerId);
    if (owned) return;
    const exists = await this.repository.getById(id);
    if (exists) throw new AppError(403, "FLASHCARDS_FORBIDDEN", "Forbidden");
    throw new AppError(404, "FLASHCARDS_NOT_FOUND", "Flashcards not found");
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
      const payload = await runWithStageTimeout("flashcards", id, () =>
        this.aiService.generateFlashcardDeck(text),
      );

      const cards: FlashcardCard[] = payload.cards.map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        imagePrompt: card.imagePrompt,
        tags: card.tags ?? undefined,
      }));

      await this.repository.saveCompletedContent(id, {
        title: payload.title,
        description: payload.description ?? null,
        cards,
      });
      logger.info("flashcards.pipeline.completed", {
        id,
        cardCount: cards.length,
      });

      void this.generateImages(id, cards).catch((error) => {
        logger.error("flashcards.images.background.failed", {
          id,
          message: error instanceof Error ? error.message : "Unknown image-stage error",
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Flashcards pipeline failed";
      logger.error("flashcards.pipeline.failed", { id, message, error });
      await this.repository.markFailed(id, message).catch(() => {});
    }
  }

  private async generateImages(id: string, cards: FlashcardCard[]): Promise<void> {
    const startedAt = Date.now();
    logger.info("flashcards.images.started", {
      id,
      cardCount: cards.length,
      concurrency: env.aiImageConcurrency,
    });

    let succeeded = 0;
    let failed = 0;
    const queue = [...cards];
    const workerCount = Math.min(env.aiImageConcurrency, queue.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const card = queue.shift();
          if (!card) break;
          try {
            const image = await this.llmProvider.generateImage({ prompt: card.imagePrompt });
            const uploaded = await this.storageService.upload({
              fileName: `flashcard-${card.id}.png`,
              mimeType: image.mediaType,
              body: image.bytes,
            });
            await this.repository.updateCardImageUrls(id, card.id, [uploaded.fileUrl]);
            succeeded += 1;
          } catch (error) {
            failed += 1;
            logger.error("flashcards.images.card.failed", {
              id,
              cardId: card.id,
              message: error instanceof Error ? error.message : "Unknown image error",
            });
          }
        }
      }),
    );

    logger.info("flashcards.images.completed", {
      id,
      succeeded,
      failed,
      totalCards: cards.length,
      durationMs: Date.now() - startedAt,
    });
  }
}
