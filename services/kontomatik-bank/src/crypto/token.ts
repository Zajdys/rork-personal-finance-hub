import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';

function keyFromEnv(tokenEncKey: string): Buffer {
  // Accept 64 hex chars or any string → sha256
  const hex = tokenEncKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  return createHash('sha256').update(hex, 'utf8').digest();
}

export function encryptMultipleAccessId(
  plaintext: string,
  tokenEncKey: string,
): { encHex: string; nonceHex: string } {
  const key = keyFromEnv(tokenEncKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  // Postgres bytea via PostgREST: \xDEADBEEF
  return {
    encHex: `\\x${enc.toString('hex')}`,
    nonceHex: `\\x${nonce.toString('hex')}`,
  };
}

function bufFromBytea(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  const s = String(raw ?? '');
  if (s.startsWith('\\x') || s.startsWith('\\X')) {
    return Buffer.from(s.slice(2), 'hex');
  }
  // Supabase sometimes returns base64
  try {
    return Buffer.from(s, 'base64');
  } catch {
    return Buffer.from(s, 'hex');
  }
}

export function decryptMultipleAccessId(
  encRaw: unknown,
  nonceRaw: unknown,
  tokenEncKey: string,
): string {
  const key = keyFromEnv(tokenEncKey);
  const enc = bufFromBytea(encRaw);
  const nonce = bufFromBytea(nonceRaw);
  const tag = enc.subarray(enc.length - 16);
  const data = enc.subarray(0, enc.length - 16);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
