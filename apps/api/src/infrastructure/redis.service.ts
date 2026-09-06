import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly instance?: RedisClientType;
  private connection?: Promise<void>;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.instance = createClient({
        url,
        socket: {
          connectTimeout: 1_500,
          reconnectStrategy: false,
        },
      });
      this.instance.on('error', () => undefined);
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.instance);
  }

  async ping(): Promise<boolean> {
    if (!this.instance) return false;

    try {
      await this.ensureConnected();
      return (await this.instance.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.instance) return null;

    try {
      await this.ensureConnected();
      return await this.instance.get(key);
    } catch {
      return null;
    }
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.instance) return;

    try {
      await this.ensureConnected();
      await this.instance.set(key, value, { EX: Math.max(1, ttlSeconds) });
    } catch {
      // PostgreSQL remains authoritative when the cache is unavailable.
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.instance) return;

    try {
      await this.ensureConnected();
      await this.instance.del(key);
    } catch {
      // PostgreSQL remains authoritative when the cache is unavailable.
    }
  }

  async incrementFixedWindow(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number } | null> {
    if (!this.instance) return null;

    try {
      await this.ensureConnected();
      const result = (await this.instance.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then
           redis.call('EXPIRE', KEYS[1], ARGV[1])
         end
         return { count, redis.call('TTL', KEYS[1]) }`,
        {
          keys: [key],
          arguments: [String(Math.max(1, ttlSeconds))],
        },
      )) as [number, number];

      return {
        count: Number(result[0]),
        ttlSeconds: Math.max(1, Number(result[1])),
      };
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance?.isOpen) {
      await this.instance.quit();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.instance || this.instance.isReady) return;

    this.connection ??= this.instance
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connection = undefined;
      });
    await this.connection;
  }
}
