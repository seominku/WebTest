import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacRequestValue(value?: string): string | null {
  if (!value) return null;

  const secret = process.env.AUTH_HASH_SECRET;
  if (!secret) return null;

  return createHmac('sha256', secret).update(value).digest('hex');
}

export function matchesSha256(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
