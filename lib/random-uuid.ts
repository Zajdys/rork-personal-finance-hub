import * as Crypto from 'expo-crypto';

/** V4 UUID — Hermes-safe (expo-crypto), ne Web Crypto API. */
export function randomUUID(): string {
  return Crypto.randomUUID();
}
