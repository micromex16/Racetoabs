import { db } from "../db";
import { encrypt, decrypt } from "./crypto";
import type { Provider } from "./types";
import type { Prisma } from "@prisma/client";

export async function getIntegration(provider: Provider) {
  return db.integration.findUnique({ where: { provider } });
}

export async function getSecret<T>(provider: Provider): Promise<T | null> {
  const i = await getIntegration(provider);
  return decrypt<T>(i?.secret);
}

export async function saveConnection(provider: Provider, data: { secret?: unknown; account?: string | null; config?: Prisma.InputJsonValue; cursor?: Prisma.InputJsonValue }) {
  const patch = {
    status: "connected",
    lastError: null,
    ...(data.secret !== undefined ? { secret: encrypt(data.secret) } : {}),
    ...(data.account !== undefined ? { account: data.account } : {}),
    ...(data.config !== undefined ? { config: data.config } : {}),
    ...(data.cursor !== undefined ? { cursor: data.cursor } : {}),
  };
  return db.integration.upsert({ where: { provider }, create: { provider, ...patch }, update: patch });
}

export async function updateSecret(provider: Provider, secret: unknown) {
  return db.integration.update({ where: { provider }, data: { secret: encrypt(secret) } });
}

export async function saveCursor(provider: Provider, cursor: Prisma.InputJsonValue) {
  return db.integration.update({ where: { provider }, data: { cursor, lastSyncAt: new Date(), lastError: null, status: "connected" } });
}

export async function markError(provider: Provider, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  await db.integration.upsert({ where: { provider }, create: { provider, status: "error", lastError: msg }, update: { status: "error", lastError: msg } });
}

export async function disconnect(provider: Provider) {
  await db.integration.upsert({ where: { provider }, create: { provider, status: "disconnected" }, update: { status: "disconnected", secret: null, cursor: {}, lastError: null } });
}
