import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { s3Client } from "../config/s3";

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
    const key = `${randomUUID()}-${input.fileName.replace(/\s+/g, "-")}`;
    logger.info("storage.upload.started", {
      fileKey: key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.body.byteLength,
      bucket: env.s3Bucket,
    });
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        Body: input.body,
        ContentType: input.mimeType,
      }),
    );
    const fileUrl = env.s3Endpoint
      ? `${env.s3Endpoint}/${env.s3Bucket}/${key}`
      : `https://${env.s3Bucket}.s3.${env.s3Region}.amazonaws.com/${key}`;
    logger.info("storage.upload.completed", {
      fileKey: key,
      fileUrl,
      bucket: env.s3Bucket,
    });

    return { fileKey: key, fileUrl };
  }

  public async download(fileKey: string): Promise<Uint8Array> {
    logger.info("storage.download.started", {
      fileKey,
      bucket: env.s3Bucket,
    });
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: env.s3Bucket,
        Key: fileKey,
      }),
    );
    if (!result.Body) {
      logger.error("storage.download.failed", {
        fileKey,
        reason: "empty_body",
      });
      throw new Error("S3 object body is empty");
    }

    const bytes = await result.Body.transformToByteArray();
    logger.info("storage.download.completed", {
      fileKey,
      byteLength: bytes.byteLength,
    });
    return bytes;
  }

  public async delete(fileKey: string): Promise<void> {
    logger.info("storage.delete.started", {
      fileKey,
      bucket: env.s3Bucket,
    });
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: env.s3Bucket,
          Key: fileKey,
        }),
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (code === "NoSuchKey" || code === "NotFound") {
        logger.info("storage.delete.object_missing", {
          fileKey,
          bucket: env.s3Bucket,
        });
        return;
      }
      throw error;
    }
    logger.info("storage.delete.completed", {
      fileKey,
      bucket: env.s3Bucket,
    });
  }
}
