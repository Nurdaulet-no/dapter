import { randomUUID } from "node:crypto";
import { pocketbase } from "../config/pocketbase";
import { logger } from "../config/logger";

export interface IStorageService {
  upload(input: {
    fileName: string;
    mimeType: string;
    body: Uint8Array;
  }): Promise<{ fileKey: string; fileUrl: string }>;
  download(fileKey: string): Promise<Uint8Array>;
  delete(fileKey: string): Promise<void>;
}

export class StorageService implements IStorageService {
  public async upload(input: {
    fileName: string;
    mimeType: string;
    body: Uint8Array;
  }): Promise<{ fileKey: string; fileUrl: string }> {
    const safeFileName = input.fileName.replace(/\s+/g, "-");
    const file = new File([input.body], `${randomUUID()}-${safeFileName}`, {
      type: input.mimeType,
    });
    logger.info("storage.upload.started", {
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.body.byteLength,
    });
    const created = await pocketbase.collection("storage_files").create({
      file,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.body.byteLength,
    }) as {
      id: string;
      file?: string;
    };
    if (!created.file) {
      throw new Error("PocketBase storage record missing file field");
    }
    const fileUrl = pocketbase.files.getURL(created, created.file);
    logger.info("storage.upload.completed", {
      fileKey: created.id,
      fileUrl,
    });

    return { fileKey: created.id, fileUrl };
  }

  public async download(fileKey: string): Promise<Uint8Array> {
    logger.info("storage.download.started", {
      fileKey,
    });
    const record = await pocketbase.collection("storage_files").getOne(fileKey) as {
      id: string;
      file?: string;
    };
    if (!record.file) {
      logger.error("storage.download.failed", {
        fileKey,
        reason: "missing_file_field",
      });
      throw new Error("PocketBase storage file is missing");
    }
    const fileUrl = pocketbase.files.getURL(record, record.file);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download storage file. status=${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    logger.info("storage.download.completed", {
      fileKey,
      byteLength: bytes.byteLength,
    });
    return bytes;
  }

  public async delete(fileKey: string): Promise<void> {
    logger.info("storage.delete.started", {
      fileKey,
    });
    try {
      await pocketbase.collection("storage_files").delete(fileKey);
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 0;
      if (status === 404) {
        logger.info("storage.delete.object_missing", {
          fileKey,
        });
        return;
      }
      throw error;
    }
    logger.info("storage.delete.completed", {
      fileKey,
    });
  }
}
