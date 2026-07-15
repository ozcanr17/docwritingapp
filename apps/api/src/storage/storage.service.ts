import { Injectable, OnModuleInit } from "@nestjs/common";
import { Client as MinioClient } from "minio";
import { apiEnv } from "../env";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor() {
    const env = apiEnv();
    const url = new URL(env.S3_ENDPOINT);
    this.bucket = env.S3_BUCKET;
    this.client = new MinioClient({
      endPoint: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      useSSL: url.protocol === "https:",
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      region: env.S3_REGION,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) await this.client.makeBucket(this.bucket, apiEnv().S3_REGION);
    } catch {
      // Object storage may be unavailable at boot (e.g. in unit tests); the
      // worker ensures the bucket exists before writing exports.
    }
  }

  async presignedDownloadUrl(storageKey: string, fileName: string, expirySeconds = 300): Promise<string> {
    return this.client.presignedGetObject(this.bucket, storageKey, expirySeconds, {
      "response-content-disposition": `attachment; filename="${fileName}"`,
    });
  }

  async presignedUploadUrl(storageKey: string, expirySeconds = 300): Promise<string> {
    return this.client.presignedPutObject(this.bucket, storageKey, expirySeconds);
  }

  async removeObject(storageKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, storageKey);
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}
