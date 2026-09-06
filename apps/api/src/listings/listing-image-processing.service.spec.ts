import { Logger } from '@nestjs/common';
import { ListingImageProcessingService } from './listing-image-processing.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { ObjectStorageService } from '../infrastructure/object-storage.service.js';
import { ClamAvScannerService } from '../infrastructure/clamav-scanner.service.js';

describe('Image processing scheduler recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles startup and timer failures, then continues the next cycle', async () => {
    vi.useFakeTimers();
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new ListingImageProcessingService(
      { isConfigured: true } as PrismaService,
      { isConfigured: true } as ObjectStorageService,
      { isConfigured: true } as ClamAvScannerService,
    );
    const process = vi
      .spyOn(service, 'processDueImages')
      .mockRejectedValueOnce(new Error('synthetic database outage'))
      .mockRejectedValueOnce(new Error('synthetic database outage'))
      .mockResolvedValue(0);
    service.onModuleInit();
    try {
      await vi.advanceTimersByTimeAsync(4000);
      expect(process).toHaveBeenCalledTimes(3);
      expect(log).toHaveBeenCalledTimes(2);
      expect(log.mock.calls.flat().join(' ')).not.toContain(
        'synthetic database outage',
      );
    } finally {
      service.onModuleDestroy();
    }
    await vi.advanceTimersByTimeAsync(4000);
    expect(process).toHaveBeenCalledTimes(3);
  });

  it('releases the running lock after a DB failure so manual retry works', async () => {
    const recover = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ count: 0 });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ListingImageProcessingService(
      {
        client: { listingImage: { updateMany: recover, findMany } },
      } as unknown as PrismaService,
      {} as ObjectStorageService,
      {} as ClamAvScannerService,
    );
    await expect(service.processDueImages()).rejects.toThrow('offline');
    await expect(service.processDueImages()).resolves.toBe(0);
    expect(recover).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
