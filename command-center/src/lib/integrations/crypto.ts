import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// AES-256-GCM for OAuth tokens at rest. Key = sha256(ENCRYPTION_KEY).
function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 16) throw new Error("ENCRYPTION_KEY must be set (32+ random chars).");
  return createHash("sha256").update(k).digest();
}

export function encrypt(obj: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  const [iv, tag, data] = s.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) as T;
}
