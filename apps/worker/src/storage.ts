import { Client as MinioClient } from "minio";

export interface StorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export function createStorage(config: StorageConfig): {
  ensureBucket: () => Promise<void>;
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
} {
  const url = new URL(config.endpoint);
  const client = new MinioClient({
    endPoint: url.hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    useSSL: url.protocol === "https:",
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region,
  });

  return {
    async ensureBucket() {
      const exists = await client.bucketExists(config.bucket).catch(() => false);
      if (!exists) await client.makeBucket(config.bucket, config.region);
    },
    async put(key, body, contentType) {
      await client.putObject(config.bucket, key, body, body.length, { "Content-Type": contentType });
    },
    async get(key) {
      const stream = await client.getObject(config.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    },
  };
}
