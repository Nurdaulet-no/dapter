import { logger } from "../config/logger";
import type { IDocumentService } from "../services/document.service";

export interface TrashRetentionJobConfig {
  retentionDays: number;
  intervalMinutes: number;
  batchSize: number;
}

export const startTrashRetentionJob = (
  documentService: IDocumentService,
  config: TrashRetentionJobConfig,
): (() => void) => {
  let inProgress = false;

  const runOnce = async () => {
    if (inProgress) {
      logger.debug("documents.trash.cleanup.skipped_already_running");
      return;
    }
    inProgress = true;
    logger.info("documents.trash.cleanup.started", {
      retentionDays: config.retentionDays,
      batchSize: config.batchSize,
    });
    try {
      const result = await documentService.cleanupExpiredTrash(
        config.retentionDays,
        config.batchSize,
      );
      logger.info("documents.trash.cleanup.completed", {
        retentionDays: config.retentionDays,
        scanned: result.scanned,
        deleted: result.deleted,
        failed: result.failed,
      });
    } finally {
      inProgress = false;
    }
  };

  void runOnce().catch((error) => {
    logger.error("documents.trash.cleanup.run_failed", {
      message: error instanceof Error ? error.message : "Unexpected cleanup error",
      error,
    });
  });

  const timer = setInterval(() => {
    void runOnce().catch((error) => {
      logger.error("documents.trash.cleanup.run_failed", {
        message: error instanceof Error ? error.message : "Unexpected cleanup error",
        error,
      });
    });
  }, config.intervalMinutes * 60 * 1000);

  return () => clearInterval(timer);
};
