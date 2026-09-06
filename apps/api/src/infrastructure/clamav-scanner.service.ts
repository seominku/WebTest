import { Injectable } from '@nestjs/common';
import { createConnection } from 'node:net';

const SOCKET_TIMEOUT_MS = 30_000;
const CHUNK_BYTES = 64 * 1024;

export class MalwareDetectedError extends Error {
  constructor(readonly signature: string) {
    super(`Malware detected: ${signature}`);
    this.name = 'MalwareDetectedError';
  }
}

@Injectable()
export class ClamAvScannerService {
  private readonly host = process.env.CLAMAV_HOST;
  private readonly port = Number(process.env.CLAMAV_PORT);

  get isConfigured(): boolean {
    return Boolean(this.host && Number.isInteger(this.port) && this.port > 0);
  }

  async ping(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      return (
        (await this.exchange([Buffer.from('zPING\0')]))
          .replace(/\0/gu, '')
          .trim() === 'PONG'
      );
    } catch {
      return false;
    }
  }

  async scan(buffer: Uint8Array): Promise<void> {
    if (!this.isConfigured) throw new Error('ClamAV is not configured');
    const packets: Buffer[] = [Buffer.from('zINSTREAM\0')];
    for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
      const chunk = Buffer.from(
        buffer.subarray(offset, Math.min(offset + CHUNK_BYTES, buffer.length)),
      );
      const size = Buffer.allocUnsafe(4);
      size.writeUInt32BE(chunk.length);
      packets.push(size, chunk);
    }
    packets.push(Buffer.alloc(4));

    const response = (await this.exchange(packets)).replace(/\0/gu, '').trim();
    if (response.endsWith('OK')) return;
    const found = response.match(/stream: (.+) FOUND$/u);
    if (found?.[1]) throw new MalwareDetectedError(found[1]);
    throw new Error(`Unexpected ClamAV response: ${response}`);
  }

  private exchange(packets: Buffer[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.host) {
        reject(new Error('ClamAV is not configured'));
        return;
      }
      const socket = createConnection({ host: this.host, port: this.port });
      const response: Buffer[] = [];
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(Buffer.concat(response).toString('utf8'));
      };
      socket.setTimeout(SOCKET_TIMEOUT_MS, () =>
        finish(new Error('ClamAV scan timed out')),
      );
      socket.on('error', (error) => finish(error));
      socket.on('data', (chunk: Buffer) => {
        response.push(chunk);
        if (chunk.includes(0)) finish();
      });
      socket.on('end', () => finish());
      socket.on('connect', () => {
        for (const packet of packets) socket.write(packet);
      });
    });
  }
}
