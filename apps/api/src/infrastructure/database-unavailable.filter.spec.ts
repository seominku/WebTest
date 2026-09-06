import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@real-estate/db';
import {
  DatabaseUnavailableFilter,
  isDatabaseUnavailable,
} from './database-unavailable.filter.js';

const error = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(
    'private query and connection details',
    { code, clientVersion: '7.10.0', meta },
  );

describe('Database outage response', () => {
  it('preserves existing authorization responses', () => {
    const reply = vi.fn();
    const response = { setHeader: vi.fn() };
    const filter = new DatabaseUnavailableFilter({
      isHeadersSent: () => false,
      reply,
    } as never);
    const host = { getArgByIndex: () => response } as unknown as ArgumentsHost;
    filter.catch(new UnauthorizedException(), host);
    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ statusCode: 401 }),
      401,
    );
    expect(response.setHeader).not.toHaveBeenCalled();
  });
  it('recognizes temporary DNS errors only for the configured DB hostname', () => {
    const dns = Object.assign(new Error('private hostname'), {
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'drill-postgres',
    });
    expect(isDatabaseUnavailable(dns, 'drill-postgres')).toBe(true);
    expect(isDatabaseUnavailable(dns, 'another-service')).toBe(false);
    expect(isDatabaseUnavailable(dns)).toBe(false);
    expect(
      isDatabaseUnavailable(new Error('unrelated bug'), 'drill-postgres'),
    ).toBe(false);
  });
  it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])(
    'recognizes %s',
    (code) => {
      expect(isDatabaseUnavailable(error(code))).toBe(true);
    },
  );
  it.each(['P2002', 'P2025', 'P1000', 'P2028'])(
    'does not relabel %s',
    (code) => {
      expect(isDatabaseUnavailable(error(code))).toBe(false);
    },
  );
  it('only recognizes transaction start timeout, not generic transaction errors', () => {
    expect(
      isDatabaseUnavailable(
        error('P2028', {
          error: 'Unable to start a transaction in the given time.',
        }),
      ),
    ).toBe(true);
    expect(
      isDatabaseUnavailable(
        error('P2028', { error: 'Transaction already closed' }),
      ),
    ).toBe(false);
  });
  it('returns a non-cacheable Korean 503 without internal details', () => {
    const reply = vi.fn();
    const response = { setHeader: vi.fn() };
    const adapter = { isHeadersSent: () => false, reply };
    const filter = new DatabaseUnavailableFilter(adapter as never);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
      getArgByIndex: () => response,
    } as unknown as ArgumentsHost;
    filter.catch(error('P1001'), host);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '3');
    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 503,
        code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
        message: expect.stringContaining('잠시 후'),
      }),
      503,
    );
    expect(JSON.stringify(reply.mock.calls)).not.toContain('private query');
  });
});
