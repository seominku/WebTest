import {
  ArgumentsHost,
  Catch,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@real-estate/db';

export function isDatabaseUnavailable(
  error: unknown,
  databaseHost?: string,
): boolean {
  // pg may propagate temporary DNS failures without wrapping them as Prisma errors.
  // Match only our configured DB host; an unrelated service's DNS error stays unchanged.
  if (
    error instanceof Error &&
    databaseHost &&
    'code' in error &&
    error.code === 'EAI_AGAIN' &&
    'syscall' in error &&
    error.syscall === 'getaddrinfo' &&
    'hostname' in error &&
    error.hostname === databaseHost
  )
    return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error.code))
    return true;
  // P2028 also covers application transaction bugs: do not classify all of them as outages.
  return (
    error.code === 'P2028' &&
    error.meta?.error === 'Unable to start a transaction in the given time.'
  );
}

@Catch()
export class DatabaseUnavailableFilter extends BaseExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost): void {
    const databaseHost = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).hostname
      : undefined;
    if (!isDatabaseUnavailable(error, databaseHost))
      return super.catch(error, host);
    const response = host
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', '3');
    super.catch(
      new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
        message:
          '데이터 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      }),
      host,
    );
  }
}
