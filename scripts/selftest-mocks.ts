/**
 * Shared Bun mocks so lib/* can import without React Native / Expo.
 * Import this first in selftests that pull bank parsers.
 */
import { mock } from 'bun:test';

mock.module('expo-file-system/legacy', () => ({
  readAsStringAsync: async () => '',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

mock.module('react-native', () => ({
  Platform: { OS: 'ios' },
}));

export function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

export function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}
