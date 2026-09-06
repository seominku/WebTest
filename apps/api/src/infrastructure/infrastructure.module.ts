import { Global, Module } from '@nestjs/common';
import { ClamAvScannerService } from './clamav-scanner.service.js';
import { ObjectStorageService } from './object-storage.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    ObjectStorageService,
    ClamAvScannerService,
  ],
  exports: [
    PrismaService,
    RedisService,
    ObjectStorageService,
    ClamAvScannerService,
  ],
})
export class InfrastructureModule {}
