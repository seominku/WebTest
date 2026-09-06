import type { CookieOptions, Response } from 'express';

export function sessionCookieName(): string {
  return process.env.APP_ENV === 'production' ? '__Host-re.sid' : 're.sid';
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(sessionCookieName(), token, {
    ...baseCookieOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(sessionCookieName(), baseCookieOptions());
}

export function readSessionCookie(header?: string): string | undefined {
  const name = sessionCookieName();
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
  };
}
