import { logger } from "../config/logger";
import type { IDocumentService } from "../services/document.service";

export interface FlashcardImageQueueJobConfig {
  intervalSeconds: number;
  batchSize: number;
}

export const startFlashcardImageQueueJob = (
  documentService: IDocumentService,
  config: FlashcardImageQueueJobConfig,
): (() => void) => {
  let inProgress = false;

  const runOnce = async () => {
    if (inProgress) {
      logger.debug("pipeline.flashcard_image.queue.skipped_already_running");
      return;
    }
    inProgress = true;
    try {
      const result = await documentService.processQueuedFlashcardImages(config.batchSize);
      logger.info("pipeline.flashcard_image.queue.completed", {
        scanned: result.scanned,
        queued: result.queued,
        failed: result.failed,
        batchSize: config.batchSize,
      });
    } finally {
      inProgress = false;
    }
  };

  void runOnce().catch((error) => {
    logger.error("pipeline.flashcard_image.queue.run_failed", {
      message: error instanceof Error ? error.message : "Unexpected flashcard image queue error",
      error,
    });
  });

  const timer = setInterval(() => {
    void runOnce().catch((error) => {
      logger.error("pipeline.flashcard_image.queue.run_failed", {
        message: error instanceof Error ? error.message : "Unexpected flashcard image queue error",
        error,
      });
    });
  }, config.intervalSeconds * 1000);

  return () => clearInterval(timer);
};
