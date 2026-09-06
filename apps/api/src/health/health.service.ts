import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../infrastructure/object-storage.service.js';
import { ClamAvScannerService } from '../infrastructure/clamav-scanner.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { RedisService } from '../infrastructure/redis.service.js';

export interface DependencyCheck {
  name: 'postgres' | 'redis' | 'object-storage' | 'malware-scanner';
  status: 'up' | 'down' | 'not-configured';
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly objectStorage: ObjectStorageService,
    private readonly malwareScanner: ClamAvScannerService,
  ) {}

  async checkDependencies(): Promise<DependencyCheck[]> {
    return Promise.all([
      this.check('postgres', this.prisma.isConfigured, () =>
        this.prisma.ping(),
      ),
      this.check('redis', this.redis.isConfigured, () => this.redis.ping()),
      this.check('object-storage', this.objectStorage.isConfigured, () =>
        this.objectStorage.ping(),
      ),
      this.check('malware-scanner', this.malwareScanner.isConfigured, () =>
        this.malwareScanner.ping(),
      ),
    ]);
  }

  private async check(
    name: DependencyCheck['name'],
    configured: boolean,
    ping: () => Promise<boolean>,
  ): Promise<DependencyCheck> {
    if (!configured) {
      return { name, status: 'not-configured' };
    }

    return { name, status: (await ping()) ? 'up' : 'down' };
  }
}
