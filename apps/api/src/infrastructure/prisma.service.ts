import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@real-estate/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly instance?: PrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString) {
      this.instance = createPrismaClient(connectionString);
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.instance);
  }

  get client(): PrismaClient {
    if (!this.instance) {
      throw new ServiceUnavailableException('Database is not configured');
    }

    return this.instance;
  }

  async ping(): Promise<boolean> {
    if (!this.instance) return false;

    try {
      await this.instance.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.instance?.$disconnect();
  }
}
