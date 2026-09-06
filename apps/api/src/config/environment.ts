import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Environment = Record<string, string | undefined>;

const optionalUrls = [
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ENDPOINT',
  'WEB_ORIGIN',
  'GEOCODING_BASE_URL',
] as const;

export function validateEnvironment(config: Environment): Environment {
  for (const key of optionalUrls) {
    const value = config[key];

    if (value) {
      try {
        new URL(value);
      } catch {
        throw new Error(`${key} must be a valid URL`);
      }
    }
  }

  const geocodingApproval = config.GEOCODING_DATA_SHARING_APPROVED;
  if (
    geocodingApproval &&
    geocodingApproval !== 'true' &&
    geocodingApproval !== 'false'
  ) {
    throw new Error('GEOCODING_DATA_SHARING_APPROVED must be true or false');
  }

  for (const key of ['API_PORT', 'WEB_PORT'] as const) {
    const value = config[key];

    if (value && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  const clamAvPort = config.CLAMAV_PORT;
  if (
    clamAvPort &&
    (!Number.isInteger(Number(clamAvPort)) ||
      Number(clamAvPort) < 1 ||
      Number(clamAvPort) > 65_535)
  ) {
    throw new Error('CLAMAV_PORT must be an integer between 1 and 65535');
  }

  const trustProxyHops = config.TRUST_PROXY_HOPS;
  if (
    trustProxyHops &&
    (!Number.isInteger(Number(trustProxyHops)) || Number(trustProxyHops) < 0)
  ) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
  }

  const hashSecret = config.AUTH_HASH_SECRET;
  if (hashSecret && hashSecret.length < 32) {
    throw new Error('AUTH_HASH_SECRET must contain at least 32 characters');
  }

  const metricsToken = config.METRICS_TOKEN;
  if (metricsToken && metricsToken.length < 32) {
    throw new Error('METRICS_TOKEN must contain at least 32 characters');
  }

  const appEnvironment = config.APP_ENV ?? 'local';
  if (!['local', 'test', 'staging', 'production'].includes(appEnvironment)) {
    throw new Error('APP_ENV must be local, test, staging, or production');
  }

  if (appEnvironment !== 'local' && appEnvironment !== 'test') {
    const required = [
      'AUTH_HASH_SECRET',
      'CLAMAV_HOST',
      'CLAMAV_PORT',
      'DATABASE_URL',
      'METRICS_TOKEN',
      'REDIS_URL',
      'S3_ACCESS_KEY',
      'S3_BUCKET',
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_SECRET_KEY',
      'TRUST_PROXY_HOPS',
      'WEB_ORIGIN',
    ] as const;

    for (const key of required) {
      if (!config[key]) {
        throw new Error(`${key} is required outside local/test environments`);
      }
    }
  }

  return config;
}

export function loadLocalEnvironment(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '..', '.env'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path });
      return;
    }
  }
}
