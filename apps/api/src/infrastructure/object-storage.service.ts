import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly bucket?: string;
  private readonly instance?: S3Client;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;

    if (endpoint && region && accessKeyId && secretAccessKey && bucket) {
      this.bucket = bucket;
      this.instance = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      });
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.instance && this.bucket);
  }

  async ping(): Promise<boolean> {
    if (!this.instance || !this.bucket) return false;

    try {
      await this.instance.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(1_500),
      });
      return true;
    } catch {
      return false;
    }
  }

  async putObject(key: string, body: Uint8Array, contentType: string) {
    const { bucket, client } = this.configuredClient();
    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: bucket,
        CacheControl: 'private, no-store',
        ContentType: contentType,
        Key: key,
      }),
    );
  }

  async getObject(key: string) {
    const { bucket, client } = this.configuredClient();
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!result.Body) {
      throw new ServiceUnavailableException('Image content is unavailable');
    }
    return {
      body: await result.Body.transformToByteArray(),
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }

  async deleteObject(key: string) {
    const { bucket, client } = this.configuredClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async listObjects(prefix: string) {
    const { bucket, client } = this.configuredClient();
    const objects: { key: string; lastModified: Date | null }[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) {
          objects.push({
            key: object.Key,
            lastModified: object.LastModified ?? null,
          });
        }
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return objects;
  }

  onModuleDestroy(): void {
    this.instance?.destroy();
  }

  private configuredClient() {
    if (!this.instance || !this.bucket) {
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    return { bucket: this.bucket, client: this.instance };
  }
}
