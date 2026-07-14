import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { PrismaClient } from "@docsys/database";
import jwt from "jsonwebtoken";
import pino from "pino";
import { z } from "zod";
import { hasDocumentReadPermission } from "./permissions";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  COLLAB_PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.string().default("info"),
});

const env = envSchema.parse(process.env);
const logger = pino({ level: env.LOG_LEVEL });
const prisma = new PrismaClient();

async function loadSnapshot(documentName: string): Promise<Uint8Array | null> {
  const snapshot = await prisma.collaborationSnapshot.findFirst({
    where: { documentId: documentName },
    orderBy: { sequence: "desc" },
  });
  return snapshot ? new Uint8Array(snapshot.snapshotData) : null;
}

async function storeSnapshot(documentName: string, state: Buffer): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentName },
    select: { organizationId: true },
  });
  if (!document) return;
  const latest = await prisma.collaborationSnapshot.findFirst({
    where: { documentId: documentName },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  await prisma.collaborationSnapshot.create({
    data: {
      organizationId: document.organizationId,
      documentId: documentName,
      sequence: (latest?.sequence ?? 0n) + 1n,
      snapshotData: new Uint8Array(state),
    },
  });
}

export function buildServer() {
  return Server.configure({
    port: env.COLLAB_PORT,
    debounce: 2000,
    maxDebounce: 10000,
    async onAuthenticate(data) {
      try {
        const payload = jwt.verify(data.token, env.JWT_SECRET) as { sub?: string };
        if (!payload.sub) throw new Error("Invalid token");
        const user = await prisma.user.findFirst({
          where: { id: payload.sub, deletedAt: null, isActive: true },
        });
        if (!user) throw new Error("Unknown user");
        const allowed = await hasDocumentReadPermission(prisma, user.id, data.documentName);
        if (!allowed) throw new Error("Forbidden");
        return { userId: user.id, displayName: user.displayName };
      } catch (error) {
        logger.warn({ documentName: data.documentName, error: (error as Error).message }, "collab auth rejected");
        throw error;
      }
    },
    extensions: [
      new Database({
        fetch: async ({ documentName }) => loadSnapshot(documentName),
        store: async ({ documentName, state }) => storeSnapshot(documentName, state),
      }),
    ],
  });
}

if (require.main === module) {
  const server = buildServer();
  server
    .listen()
    .then(() => logger.info({ port: env.COLLAB_PORT }, "collaboration server listening"))
    .catch((error: unknown) => {
      logger.error({ error }, "collaboration server failed to start");
      process.exit(1);
    });
}
