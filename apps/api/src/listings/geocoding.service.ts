import { Injectable, Logger } from '@nestjs/common';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, Promise<GeocodingResult | null>>();
  private readonly baseUrl = process.env.GEOCODING_BASE_URL;
  private readonly dataSharingApproved =
    process.env.GEOCODING_DATA_SHARING_APPROVED === 'true';
  private readonly userAgent =
    process.env.GEOCODING_USER_AGENT ?? 'real-estate-platform-local/0.1';
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  geocode(address: {
    postalCode?: string;
    roadAddress: string;
  }): Promise<GeocodingResult | null> {
    if (
      process.env.APP_ENV === 'test' ||
      !this.baseUrl ||
      !this.dataSharingApproved
    ) {
      return Promise.resolve(null);
    }
    const query = [address.roadAddress, address.postalCode, '대한민국']
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cacheKey = query.toLocaleLowerCase('ko-KR');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const task = this.queue.then(() => this.request(query));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    this.cache.set(cacheKey, task);
    void task.then((result) => {
      if (!result) this.cache.delete(cacheKey);
    });
    return task;
  }

  private async request(query: string): Promise<GeocodingResult | null> {
    if (!this.baseUrl) return null;
    const waitMilliseconds = Math.max(
      0,
      1_100 - (Date.now() - this.lastRequestAt),
    );
    if (waitMilliseconds) {
      await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('countrycodes', 'kr');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    this.lastRequestAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'ko',
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const [result] = (await response.json()) as NominatimResult[];
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return null;
      }
      return { latitude, longitude };
    } catch (error) {
      this.logger.warn(
        `Address geocoding failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
